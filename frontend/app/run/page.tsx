"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Play, Loader2 } from "lucide-react"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useStartRun } from "@/hooks/use-runs"
import { DEFAULT_RUN_REQUEST, type RunRequest } from "@/lib/kg-options"

function toLines(value: string): string[] {
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
}

export default function RunPage() {
  const router = useRouter()
  const start = useStartRun()

  const [input, setInput] = useState("")
  const [filter, setFilter] = useState(DEFAULT_RUN_REQUEST.filter.join("\n"))
  const [exclude, setExclude] = useState(DEFAULT_RUN_REQUEST.exclude.join("\n"))
  const [provider, setProvider] = useState<RunRequest["provider"]>("ollama")
  const [model, setModel] = useState(DEFAULT_RUN_REQUEST.model)
  const [host, setHost] = useState(DEFAULT_RUN_REQUEST.host)
  const [apiKey, setApiKey] = useState("")
  const [output, setOutput] = useState(DEFAULT_RUN_REQUEST.output)
  const [exportFormat, setExportFormat] =
    useState<RunRequest["exportFormat"]>("json")
  const [chunkSize, setChunkSize] = useState(String(DEFAULT_RUN_REQUEST.chunkSize))
  const [resume, setResume] = useState(false)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const filters = toLines(filter)
    if (!input.trim()) {
      toast.error("Input directory is required")
      return
    }
    if (filters.length === 0) {
      toast.error("At least one include pattern is required")
      return
    }
    const req: RunRequest = {
      input: input.trim(),
      filter: filters,
      exclude: toLines(exclude),
      provider,
      model: model.trim(),
      host: host.trim(),
      apiKey: provider === "openai" && apiKey.trim() ? apiKey.trim() : undefined,
      output: output.trim(),
      exportFormat,
      chunkSize: Number(chunkSize) || DEFAULT_RUN_REQUEST.chunkSize,
      resume,
    }
    start.mutate(req, {
      onSuccess: ({ run }) => {
        toast.success("Run started")
        router.push(`/runs/${run.id}`)
      },
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Failed to start run"),
    })
  }

  return (
    <form onSubmit={submit}>
      <PageHeader
        title="New run"
        description="Configure input, model, and output, then launch."
        actions={
          <Button type="submit" size="sm" disabled={start.isPending}>
            {start.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Start run
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Input</CardTitle>
            <CardDescription>Directory and file patterns to process.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="input">Input directory</Label>
              <Input
                id="input"
                placeholder="/path/to/project"
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter">Include patterns (one per line)</Label>
              <Textarea
                id="filter"
                rows={3}
                className="font-mono text-xs"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exclude">Exclude patterns (one per line)</Label>
              <Textarea
                id="exclude"
                rows={2}
                className="font-mono text-xs"
                value={exclude}
                onChange={(e) => setExclude(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Model</CardTitle>
            <CardDescription>Generation provider and model.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Select
                value={provider}
                onValueChange={(v) => setProvider(v as RunRequest["provider"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ollama">Ollama (local)</SelectItem>
                  <SelectItem value="openai">OpenAI-compatible</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model">Model</Label>
              <Input
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="host">Host / base URL</Label>
              <Input
                id="host"
                value={host}
                onChange={(e) => setHost(e.target.value)}
              />
            </div>
            {provider === "openai" && (
              <div className="space-y-1.5">
                <Label htmlFor="apiKey">API key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder="sk-… (or set $OPENAI_API_KEY)"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Output</CardTitle>
            <CardDescription>Where and how to write the graph.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="output">Output file</Label>
              <Input
                id="output"
                value={output}
                onChange={(e) => setOutput(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Export format</Label>
              <Select
                value={exportFormat}
                onValueChange={(v) =>
                  setExportFormat(v as RunRequest["exportFormat"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">json</SelectItem>
                  <SelectItem value="jsonl">jsonl</SelectItem>
                  <SelectItem value="mcp-jsonl">mcp-jsonl</SelectItem>
                  <SelectItem value="dot">dot</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Processing</CardTitle>
            <CardDescription>Chunking and resume behavior.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="chunkSize">Chunk size (characters)</Label>
              <Input
                id="chunkSize"
                type="number"
                value={chunkSize}
                onChange={(e) => setChunkSize(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={resume}
                onCheckedChange={(v) => setResume(v === true)}
              />
              Resume from checkpoint (skip already-processed chunks)
            </label>
          </CardContent>
        </Card>
      </div>
    </form>
  )
}
