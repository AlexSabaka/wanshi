import { ComingSoon } from "@/components/coming-soon"

export default function TimelinePage() {
  return (
    <ComingSoon
      title="Timeline"
      description="Scrub valid-time: see the graph as of date T, surface contradictions and supersessions."
      note="The bi-temporal data (validAt / invalidAt / superseded) is already carried through to the inspector; the scrubber is a later mode."
    />
  )
}
