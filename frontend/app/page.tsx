import Link from "next/link"
import { Play } from "lucide-react"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { RecentRuns } from "@/components/recent-runs"

export default function DashboardPage() {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Configure a run, launch it, and watch live progress."
        actions={
          <Button asChild size="sm">
            <Link href="/run">
              <Play className="h-4 w-4" />
              New run
            </Link>
          </Button>
        }
      />

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Recent runs</h2>
        <RecentRuns />
      </div>
    </div>
  )
}
