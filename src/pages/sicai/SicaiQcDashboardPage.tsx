import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type Row = {
  id: string;
  status: string;
  template_id: string;
  template?: {
    illustration_id: string;
    family_code: string;
    cardinality_code: string;
    regime_code: string;
  } | null;
};

type Check = { job_id: string; check_name: string; check_status: string };

const FAMILIES = ["CONCEPTUELLE_SYSTEMIQUE", "NARRATIVE_SCENIQUE", "EMBLEMATIQUE_INDICIELLE", "PROCESSUELLE", "ANALYTIQUE_COMPARATIVE", "STRUCTURELLE_ARCHITECTURALE"];
const CARDS = ["UNITAIRE", "BINAIRE", "TERNAIRE", "MULTIPLE"];
const REGIMES = ["CONCRET", "SEMI_METAPHORIQUE", "ABSTRAIT_SYSTEMIQUE"];

const STATUS_COLOR: Record<string, string> = {
  approved: "bg-green-500",
  review_needed: "bg-orange-500",
  qc_failed: "bg-red-500",
  qc_pending: "bg-blue-300",
  generated: "bg-slate-300",
  generating: "bg-slate-200",
  queued: "bg-slate-100",
};

export default function SicaiQcDashboardPage() {
  const [jobs, setJobs] = useState<Row[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("sicai_generation_jobs")
        .select("id, status, template_id, sicai_templates(illustration_id, family_code, cardinality_code, regime_code)")
        .order("created_at", { ascending: false });
      if (error) toast.error(error.message);
      const mapped = (data ?? []).map((j: any) => ({ ...j, template: j.sicai_templates }));
      // Keep only most recent job per template
      const seen = new Set<string>();
      const dedup: Row[] = [];
      for (const r of mapped) {
        if (!r.template_id || seen.has(r.template_id)) continue;
        seen.add(r.template_id);
        dedup.push(r);
      }
      setJobs(dedup);

      const ids = dedup.map((r) => r.id);
      if (ids.length) {
        const { data: c } = await supabase.from("sicai_qc_checks")
          .select("job_id, check_name, check_status").in("job_id", ids);
        setChecks((c as Check[]) ?? []);
      }
      setLoading(false);
    })();
  }, []);

  const counts = jobs.reduce<Record<string, number>>((a, j) => {
    a[j.status] = (a[j.status] || 0) + 1;
    return a;
  }, {});

  const checksByName: Record<string, { pass: number; warn: number; fail: number; skipped: number }> = {};
  for (const c of checks) {
    if (!checksByName[c.check_name]) checksByName[c.check_name] = { pass: 0, warn: 0, fail: 0, skipped: 0 };
    (checksByName[c.check_name] as any)[c.check_status]++;
  }

  // matrix key
  const matrix = new Map<string, Row>();
  for (const j of jobs) {
    if (!j.template) continue;
    matrix.set(`${j.template.family_code}|${j.template.cardinality_code}|${j.template.regime_code}`, j);
  }

  return (
    <>
      <Helmet><title>QC Dashboard — SICAI</title></Helmet>
      <div className="space-y-6 max-w-[1400px]">
        <div>
          <h1 className="text-2xl font-bold">QC Dashboard</h1>
          <p className="text-sm text-muted-foreground">Vue d'ensemble des contrôles qualité des templates SICAI.</p>
        </div>

        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
          <>
            <Card className="p-4">
              <h2 className="font-semibold mb-2">Statuts</h2>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(counts).map(([s, n]) => (
                  <Badge key={s} variant="outline" className="text-sm">
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${STATUS_COLOR[s] ?? "bg-slate-400"}`} />
                    {s} : {n}
                  </Badge>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <h2 className="font-semibold mb-3">Checks QC</h2>
              <div className="space-y-2">
                {Object.entries(checksByName).map(([name, c]) => {
                  const total = c.pass + c.warn + c.fail + c.skipped;
                  return (
                    <div key={name} className="flex items-center gap-2 text-xs">
                      <div className="w-48 font-mono">{name}</div>
                      <div className="flex-1 h-4 bg-muted rounded overflow-hidden flex">
                        {c.pass > 0 && <div className="bg-green-500" style={{ width: `${c.pass / total * 100}%` }} />}
                        {c.warn > 0 && <div className="bg-orange-500" style={{ width: `${c.warn / total * 100}%` }} />}
                        {c.fail > 0 && <div className="bg-red-500" style={{ width: `${c.fail / total * 100}%` }} />}
                        {c.skipped > 0 && <div className="bg-slate-300" style={{ width: `${c.skipped / total * 100}%` }} />}
                      </div>
                      <div className="w-32 text-right">P{c.pass} · W{c.warn} · F{c.fail} · S{c.skipped}</div>
                    </div>
                  );
                })}
                {Object.keys(checksByName).length === 0 && (
                  <p className="text-xs text-muted-foreground">Aucun check enregistré.</p>
                )}
              </div>
            </Card>

            <Card className="p-4 overflow-x-auto">
              <h2 className="font-semibold mb-3">Matrice 6 × 4 × 3</h2>
              {FAMILIES.map((fam) => (
                <div key={fam} className="mb-4">
                  <div className="text-xs font-semibold mb-1">{fam}</div>
                  <table className="text-[10px] border-collapse">
                    <thead>
                      <tr>
                        <th className="p-1"></th>
                        {REGIMES.map((r) => <th key={r} className="p-1 font-normal text-muted-foreground">{r}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {CARDS.map((card) => (
                        <tr key={card}>
                          <td className="p-1 text-muted-foreground pr-2">{card}</td>
                          {REGIMES.map((reg) => {
                            const j = matrix.get(`${fam}|${card}|${reg}`);
                            const cls = j ? (STATUS_COLOR[j.status] ?? "bg-slate-300") : "bg-slate-100";
                            const content = (
                              <div className={`w-12 h-8 rounded ${cls} border border-border`} title={j?.template?.illustration_id ?? "—"} />
                            );
                            return (
                              <td key={reg} className="p-1">
                                {j?.template_id ? <Link to={`/admin/sicai/templates/detail/${j.template_id}`}>{content}</Link> : content}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </Card>

            <Card className="p-4">
              <h2 className="font-semibold mb-2">À revoir en priorité</h2>
              <ul className="text-sm space-y-1">
                {jobs.filter((j) => j.status === "qc_failed" || j.status === "review_needed")
                  .sort((a, b) => (a.status === "qc_failed" ? -1 : 1))
                  .map((j) => (
                    <li key={j.id} className="flex items-center gap-2">
                      <span className={`inline-block w-2 h-2 rounded-full ${STATUS_COLOR[j.status]}`} />
                      <code className="text-xs">{j.template?.illustration_id}</code>
                      <Badge variant="outline" className="text-[10px]">{j.status}</Badge>
                    </li>
                  ))}
                {jobs.filter((j) => j.status === "qc_failed" || j.status === "review_needed").length === 0 && (
                  <p className="text-xs text-muted-foreground">Rien à revoir.</p>
                )}
              </ul>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
