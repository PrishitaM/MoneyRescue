/**
 * Catalog of real Razorpay card failure signals used by the /test-checkout simulator.
 * Descriptions/codes/steps follow Razorpay's Cards Error Codes documentation so the
 * simulated webhook payloads are shaped exactly like production deliveries.
 */
export type SimulatedFailure = {
  signal: string;
  label: string;
  eventType: string;
  errorCode: string;
  description: string;
  source: string;
  step: string;
};

export const SIMULATED_FAILURES: SimulatedFailure[] = [
  {
    signal: "card_expired",
    label: "Expired card",
    eventType: "payment.failed",
    errorCode: "BAD_REQUEST_ERROR",
    description: "Your card has expired. Try another card or contact your bank.",
    source: "customer",
    step: "payment_authorization",
  },
  {
    signal: "insufficient_funds",
    label: "Insufficient funds",
    eventType: "payment.failed",
    errorCode: "BAD_REQUEST_ERROR",
    description: "Your payment failed as the account balance is low. Try another card.",
    source: "bank",
    step: "payment_authorization",
  },
  {
    signal: "authentication_failed",
    label: "Authentication / OTP failed (3DS)",
    eventType: "payment.failed",
    errorCode: "BAD_REQUEST_ERROR",
    description: "Payment processing failed because of an incorrect OTP.",
    source: "customer",
    step: "payment_authentication",
  },
  {
    signal: "incorrect_cvv",
    label: "Incorrect CVV",
    eventType: "payment.failed",
    errorCode: "BAD_REQUEST_ERROR",
    description: "Payment failed because the CVV entered was incorrect.",
    source: "customer",
    step: "payment_authorization",
  },
  {
    signal: "debit_instrument_blocked",
    label: "Card blocked by bank",
    eventType: "payment.failed",
    errorCode: "BAD_REQUEST_ERROR",
    description: "Your card has been blocked by your bank. Contact your bank to unblock it.",
    source: "bank",
    step: "payment_authorization",
  },
  {
    signal: "card_disabled_for_online_payments",
    label: "Card not enabled for online payments",
    eventType: "payment.failed",
    errorCode: "BAD_REQUEST_ERROR",
    description:
      "Your card is not enabled for online transactions. Enable it in your bank app and retry.",
    source: "bank",
    step: "payment_authorization",
  },
  {
    signal: "transaction_limit_exceeded",
    label: "Transaction limit exceeded",
    eventType: "payment.failed",
    errorCode: "BAD_REQUEST_ERROR",
    description: "Payment failed because the transaction limit on the card was exceeded.",
    source: "bank",
    step: "payment_authorization",
  },
  {
    signal: "international_card_not_allowed",
    label: "International card not allowed",
    eventType: "payment.failed",
    errorCode: "BAD_REQUEST_ERROR",
    description: "International cards are not supported for this payment.",
    source: "business",
    step: "payment_initiation",
  },
  {
    signal: "payment_timed_out",
    label: "Payment timed out",
    eventType: "payment.failed",
    errorCode: "GATEWAY_ERROR",
    description: "Payment was not completed within the allowed time and timed out.",
    source: "customer",
    step: "payment_authentication",
  },
  {
    signal: "payment_cancelled",
    label: "Customer cancelled the payment",
    eventType: "payment.failed",
    errorCode: "BAD_REQUEST_ERROR",
    description: "Payment was cancelled by the customer.",
    source: "customer",
    step: "payment_authentication",
  },
  {
    signal: "card_declined",
    label: "Card declined by issuer",
    eventType: "payment.failed",
    errorCode: "BAD_REQUEST_ERROR",
    description: "Your card was declined by the issuing bank. Try another payment method.",
    source: "bank",
    step: "payment_authorization",
  },
  {
    signal: "payment_failed",
    label: "Generic bank decline",
    eventType: "payment.failed",
    errorCode: "GATEWAY_ERROR",
    description: "Payment failed at the bank with no specific reason.",
    source: "bank",
    step: "payment_authorization",
  },
  {
    signal: "gateway_technical_error",
    label: "Gateway technical error",
    eventType: "payment.failed",
    errorCode: "GATEWAY_ERROR",
    description: "Payment failed due to a technical error at the partner bank.",
    source: "gateway",
    step: "payment_authorization",
  },
  {
    signal: "bank_downtime",
    label: "Bank downtime",
    eventType: "payment.failed",
    errorCode: "GATEWAY_ERROR",
    description: "Your bank is currently facing downtime. Retry after some time.",
    source: "bank",
    step: "payment_authorization",
  },
  {
    signal: "bank_technical_error",
    label: "Issuing bank technical error",
    eventType: "payment.failed",
    errorCode: "GATEWAY_ERROR",
    description: "Payment failed due to a technical error at the customer's bank.",
    source: "bank",
    step: "payment_authorization",
  },
  {
    signal: "payment_risk_check_failed",
    label: "Fraud risk check failed",
    eventType: "payment.failed",
    errorCode: "BAD_REQUEST_ERROR",
    description: "Payment was blocked because it failed the risk check.",
    source: "bank",
    step: "payment_authorization",
  },
  {
    signal: "payment.authorized",
    label: "Authorized but not captured",
    eventType: "payment.authorized",
    errorCode: "",
    description: "",
    source: "",
    step: "",
  },
  {
    signal: "payment.captured",
    label: "Successful payment (healthy baseline)",
    eventType: "payment.captured",
    errorCode: "",
    description: "",
    source: "",
    step: "",
  },
  {
    signal: "quantum_flux_decline",
    label: "Unrecognized reason (forces AI fallback)",
    eventType: "payment.failed",
    errorCode: "BAD_REQUEST_ERROR",
    description: "Issuer responded with advisory code QF-88 (unmapped by the gateway).",
    source: "bank",
    step: "payment_authorization",
  },
];

export function findSimulatedFailure(signal: string): SimulatedFailure | null {
  return SIMULATED_FAILURES.find((f) => f.signal === signal) ?? null;
}
