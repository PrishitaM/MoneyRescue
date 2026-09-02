/**
 * Minimal SMTP client (server-only) used to deliver recovery emails.
 * Supports implicit TLS (port 465) and STARTTLS (port 587) with AUTH LOGIN.
 */
import type { Socket } from "node:net";

export type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
};

export function readSmtpConfig(): SmtpConfig | null {
  const host = process.env["SMTP_HOST"];
  const user = process.env["SMTP_USER"];
  const password = process.env["SMTP_PASSWORD"];
  if (!host || !user || !password) return null;
  const port = Number(process.env["SMTP_PORT"] ?? 587);
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 587,
    user,
    password,
    from: process.env["SMTP_FROM"] || user,
  };
}

type Conn = {
  write: (data: string) => void;
  read: () => Promise<string>;
  end: () => void;
  detach: () => void;
  socket: Socket;
};

function wrap(socket: Socket): Conn {
  let buffer = "";
  const waiters: Array<(value: string) => void> = [];

  const flush = () => {
    // A complete SMTP reply ends with "<code><space>...\r\n".
    const match = /(^|\r\n)(\d{3}) [^\r\n]*\r\n$/.exec(buffer);
    if (match && waiters.length > 0) {
      const reply = buffer;
      buffer = "";
      waiters.shift()!(reply);
    }
  };

  const onData = (chunk: string) => {
    buffer += chunk;
    flush();
  };
  socket.setEncoding("utf8");
  socket.on("data", onData);

  return {
    write: (data: string) => socket.write(data),
    read: () =>
      new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("SMTP read timeout")), 15000);
        waiters.push((value) => {
          clearTimeout(timer);
          resolve(value);
        });
        flush();
      }),
    end: () => socket.destroy(),
    detach: () => socket.off("data", onData),
    socket,
  };
}

async function expect(conn: Conn, codes: number[], step: string): Promise<string> {
  const reply = await conn.read();
  const code = Number(reply.trim().slice(0, 3));
  if (!codes.includes(code)) {
    throw new Error(`SMTP ${step} failed: ${reply.trim()}`);
  }
  return reply;
}

function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7F]/.test(value)
    ? `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`
    : value;
}

function buildMessage(fromAddress: string, to: string, subject: string, body: string): string {
  const domain = fromAddress.split("@")[1] ?? "localhost";
  const headers = [
    `From: ${encodeHeader("Revenue Risk Radar")} <${fromAddress}>`,
    `To: ${to}`,
    `Reply-To: ${fromAddress}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@${domain}>`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
  ].join("\r\n");
  const dotStuffed = body.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
  return `${headers}\r\n\r\n${dotStuffed}\r\n.\r\n`;
}

export async function sendMailViaSmtp(options: {
  config: SmtpConfig;
  to: string;
  subject: string;
  body: string;
}): Promise<{ queueId: string | null }> {
  const { config, to, subject, body } = options;
  const net = await import("node:net");
  const tls = await import("node:tls");

  const implicitTls = config.port === 465;
  let socket: Socket = implicitTls
    ? (tls.connect({ host: config.host, port: config.port, servername: config.host }) as unknown as Socket)
    : net.connect({ host: config.host, port: config.port });

  await new Promise<void>((resolve, reject) => {
    socket.once(implicitTls ? "secureConnect" : "connect", () => resolve());
    socket.once("error", reject);
  });

  let conn = wrap(socket);
  try {
    await expect(conn, [220], "greeting");
    conn.write(`EHLO radar\r\n`);
    await expect(conn, [250], "EHLO");

    if (!implicitTls) {
      conn.write("STARTTLS\r\n");
      await expect(conn, [220], "STARTTLS");
      // Release the plaintext reader before TLS takes ownership of the same stream.
      // Leaving both readers attached causes intermittent Web Stream releaseLock errors.
      conn.detach();
      socket = tls.connect({
        socket: socket as never,
        servername: config.host,
      }) as unknown as Socket;
      await new Promise<void>((resolve, reject) => {
        socket.once("secureConnect", () => resolve());
        socket.once("error", reject);
      });
      conn = wrap(socket);
      conn.write(`EHLO radar\r\n`);
      await expect(conn, [250], "EHLO (TLS)");
    }

    conn.write("AUTH LOGIN\r\n");
    await expect(conn, [334], "AUTH");
    conn.write(`${Buffer.from(config.user, "utf8").toString("base64")}\r\n`);
    await expect(conn, [334], "AUTH user");
    conn.write(`${Buffer.from(config.password, "utf8").toString("base64")}\r\n`);
    await expect(conn, [235], "AUTH password");

    // SMTP_FROM may be "Name <addr>" and can carry stray trailing punctuation/whitespace.
    const configuredAddress = /<([^>]+)>/.exec(config.from)?.[1] ?? config.from;
    const envelopeFromMatch = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(configuredAddress);
    let envelopeFrom = envelopeFromMatch?.[0] ?? config.user;
    // Gmail only accepts the authenticated mailbox as sender; a mismatch gets silently dropped.
    if (/(gmail\.com|googlemail\.com)$/i.test(config.host) || /smtp\.gmail\.com/i.test(config.host)) {
      envelopeFrom = config.user;
    }
    conn.write(`MAIL FROM:<${envelopeFrom}>\r\n`);
    await expect(conn, [250], "MAIL FROM");
    conn.write(`RCPT TO:<${to}>\r\n`);
    await expect(conn, [250, 251], "RCPT TO");
    conn.write("DATA\r\n");
    await expect(conn, [354], "DATA");
    conn.write(buildMessage(envelopeFrom, to, subject, body));
    const accepted = await expect(conn, [250], "message body");
    conn.write("QUIT\r\n");
    return { queueId: accepted.trim().slice(4) || null };
  } finally {
    conn.end();
  }
}
