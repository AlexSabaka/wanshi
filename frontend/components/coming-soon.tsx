import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"

export function ComingSoon({
  title,
  description,
  note,
}: {
  title: string
  description?: string
  note?: string
}) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {note ?? "Coming soon."}
        </CardContent>
      </Card>
    </div>
  )
}
