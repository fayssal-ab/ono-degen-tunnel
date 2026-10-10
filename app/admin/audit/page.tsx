import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { getAuditLog } from "@/lib/auditLog";
import { RelativeTime } from "@/components/ui/RelativeTime";

export const dynamic = "force-dynamic";

export default async function AdminAudit() {
  if (!(await isAdminSession())) redirect("/login");
  const entries = await getAuditLog(150);

  return (
    <div className="space-y-6">
      <div>
        <p className="label">History</p>
        <h1 className="mt-1 text-2xl">Audit log</h1>
      </div>

      {entries.length === 0 ? (
        <p className="surface p-6 text-sm text-text-1">No admin actions recorded yet.</p>
      ) : (
        <div className="surface overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="label px-4 py-3 font-normal">When</th>
                <th className="label px-4 py-3 font-normal">Action</th>
                <th className="label px-4 py-3 font-normal">Target</th>
                <th className="label px-4 py-3 font-normal">Detail</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-line/60 last:border-0 align-top">
                  <td className="whitespace-nowrap px-4 py-2.5 text-text-2">
                    <RelativeTime iso={e.created_at} />
                  </td>
                  <td className="px-4 py-2.5 font-mono text-text-0">{e.action}</td>
                  <td className="px-4 py-2.5 font-mono text-text-1">{e.target || "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-text-2">
                    {e.detail ? (
                      <span className="line-clamp-2 break-all">{JSON.stringify(e.detail)}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
