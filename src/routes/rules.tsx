import { PageHead } from "@/components/PageHead";
import { CategoryBadge, UrgencyBadge } from "@/components/RiskBadges";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { rulesQueryOptions } from "@/lib/risk.queries";
import { createRule, deleteRule, updateRule } from "@/lib/risk.functions";
import {
  CATEGORY_LABELS,
  URGENCY_LABELS,
  type RiskCategory,
  type RiskRule,
  type RiskUrgency,
} from "@/lib/risk";

type Draft = {
  signal: string;
  root_cause: string;
  category: RiskCategory;
  recommended_action: string;
  urgency: RiskUrgency;
};

const EMPTY: Draft = {
  signal: "",
  root_cause: "",
  category: "customer_fixable",
  recommended_action: "",
  urgency: "medium",
};

export const Route = createFileRoute("/rules")({
  head: () => ({
    meta: [
      { title: "Failure Signal Knowledge Base — Revenue Risk Radar" },
      {
        name: "description",
        content:
          "Edit the rules that map Razorpay payment failure signals to root cause, category, urgency and recommended recovery action.",
      },
      { property: "og:title", content: "Failure Signal Knowledge Base — Revenue Risk Radar" },
      {
        property: "og:description",
        content:
          "Maintain the mapping from Razorpay failure signals to root causes and recommended recovery actions.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { signal?: string } => {
    const raw = search["signal"];
    return typeof raw === "string" && raw.length > 0 ? { signal: raw } : {};
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(rulesQueryOptions),
  component: RulesPage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-2xl px-6 py-24 text-center">
      <h1 className="text-xl font-semibold">Knowledge base unavailable</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
  notFoundComponent: () => <div className="p-10">Not found</div>,
});

const inputClass =
  "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-ring";

function DraftFields({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
}) {
  return (
    <>
      <td className="p-2 align-top">
        <input
          className={`${inputClass} font-mono`}
          value={draft.signal}
          placeholder="insufficient_funds"
          onChange={(e) => onChange({ ...draft, signal: e.target.value })}
        />
      </td>
      <td className="p-2 align-top">
        <textarea
          className={inputClass}
          rows={3}
          value={draft.root_cause}
          placeholder="Why the charge failed"
          onChange={(e) => onChange({ ...draft, root_cause: e.target.value })}
        />
      </td>
      <td className="p-2 align-top">
        <select
          className={inputClass}
          value={draft.category}
          onChange={(e) => onChange({ ...draft, category: e.target.value as RiskCategory })}
        >
          {(Object.keys(CATEGORY_LABELS) as RiskCategory[]).map((key) => (
            <option key={key} value={key}>
              {CATEGORY_LABELS[key]}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2 align-top">
        <textarea
          className={inputClass}
          rows={3}
          value={draft.recommended_action}
          placeholder="What a human should do"
          onChange={(e) => onChange({ ...draft, recommended_action: e.target.value })}
        />
      </td>
      <td className="p-2 align-top">
        <select
          className={inputClass}
          value={draft.urgency}
          onChange={(e) => onChange({ ...draft, urgency: e.target.value as RiskUrgency })}
        >
          {(Object.keys(URGENCY_LABELS) as RiskUrgency[]).map((key) => (
            <option key={key} value={key}>
              {URGENCY_LABELS[key]}
            </option>
          ))}
        </select>
      </td>
    </>
  );
}

function RulesPage() {
  const { data: rules } = useSuspenseQuery(rulesQueryOptions);
  const { signal: prefill } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();

  const create = useServerFn(createRule);
  const update = useServerFn(updateRule);
  const remove = useServerFn(deleteRule);

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (prefill) setDraft((d) => ({ ...d, signal: prefill }));
  }, [prefill]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["risk_rules"] });

  async function handleCreate() {
    if (!draft.signal.trim() || !draft.root_cause.trim() || !draft.recommended_action.trim()) {
      toast.error("Signal, root cause and recommended action are required.");
      return;
    }
    setBusy(true);
    try {
      await create({ data: draft });
      setDraft(EMPTY);
      await refresh();
      await navigate({ search: {} });
      toast.success("Rule added.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add rule.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(id: string) {
    setBusy(true);
    try {
      await update({ data: { id, ...editDraft } });
      setEditingId(null);
      await refresh();
      toast.success("Rule updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update rule.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    try {
      await remove({ data: { id } });
      await refresh();
      toast.success("Rule deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete rule.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(rule: RiskRule) {
    setEditingId(rule.id);
    setEditDraft({
      signal: rule.signal,
      root_cause: rule.root_cause,
      category: rule.category,
      recommended_action: rule.recommended_action,
      urgency: rule.urgency,
    });
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8 md:py-10">
      <PageHead
        title="Failure knowledge base"
        intro="One row per Razorpay failure signal: what actually went wrong, whose side it sits on, and what we do about it. The agent reads this table before it writes anything."
      />

      <div className="mt-8 overflow-x-auto rounded-sm border border-border bg-card">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-[11px] uppercase tracking-widest text-muted-foreground">
              <th className="w-[16%] p-3 font-semibold">Signal</th>
              <th className="w-[27%] p-3 font-semibold">Root cause</th>
              <th className="w-[13%] p-3 font-semibold">Category</th>
              <th className="w-[27%] p-3 font-semibold">Recommended action</th>
              <th className="w-[10%] p-3 font-semibold">Urgency</th>
              <th className="p-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) =>
              editingId === rule.id ? (
                <tr key={rule.id} className="border-b border-border bg-muted/20">
                  <DraftFields draft={editDraft} onChange={setEditDraft} />
                  <td className="p-2 align-top">
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleUpdate(rule.id)}
                        className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={rule.id} className="border-b border-border align-top">
                  <td className="p-3 font-mono text-xs text-foreground">{rule.signal}</td>
                  <td className="p-3 text-muted-foreground">{rule.root_cause}</td>
                  <td className="p-3 text-xs">
                    <CategoryBadge category={rule.category} />
                  </td>
                  <td className="p-3 text-muted-foreground">{rule.recommended_action}</td>
                  <td className="p-3 text-xs">
                    <UrgencyBadge urgency={rule.urgency} />
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(rule)}
                        className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleDelete(rule.id)}
                        className="rounded-md border border-destructive/40 px-2.5 py-1.5 text-xs font-medium text-destructive disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}
            <tr className="bg-muted/10">
              <DraftFields draft={draft} onChange={setDraft} />
              <td className="p-2 align-top">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleCreate}
                  className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  Add rule
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  );
}
