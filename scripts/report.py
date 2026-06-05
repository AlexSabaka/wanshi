#!/usr/bin/env python3
"""
Benchmark report generator.

Loads all *.json benchmark result files from one or more directories,
micro-aggregates runs with the same (dataset, model, classifier) key,
generates comparison bar charts, and writes a markdown report.

Usage:
    python scripts/report.py ./test_bench_kg_gen
    python scripts/report.py ./test_bench_kg_gen ./test_bench_raw --output report.md
    python scripts/report.py ./test_bench_kg_gen --no-aggregate  # one row per file

Dependencies:
    pip install matplotlib
"""

import sys
import json
import argparse
from pathlib import Path
from datetime import datetime
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional


# ─── Data classes ─────────────────────────────────────────────────────────────

@dataclass
class Metrics:
    precision: float = 0.0
    recall:    float = 0.0
    f1:        float = 0.0
    tp:        int   = 0
    fp:        int   = 0
    fn:        int   = 0


@dataclass
class LevelMetrics:
    entity:   Metrics = field(default_factory=Metrics)
    relation: Metrics = field(default_factory=Metrics)
    triple:   Metrics = field(default_factory=Metrics)


@dataclass
class RunResult:
    dataset:               str
    model:                 str
    classifier:            str
    sample_count:          int
    exact:                 LevelMetrics
    semantic:              LevelMetrics
    intrinsic_mean:        float
    avg_entities:          float
    avg_relations:         float
    samples_no_relations:  int
    duration_ms:           int
    source_file:           str


# ─── Loading ──────────────────────────────────────────────────────────────────

def _load_metrics(d: dict) -> Metrics:
    return Metrics(
        precision=d.get('precision', 0.0),
        recall=d.get('recall', 0.0),
        f1=d.get('f1', 0.0),
        tp=d.get('tp', 0),
        fp=d.get('fp', 0),
        fn=d.get('fn', 0),
    )


def _load_level(d: dict) -> LevelMetrics:
    return LevelMetrics(
        entity=_load_metrics(d.get('entity', {})),
        relation=_load_metrics(d.get('relation', {})),
        triple=_load_metrics(d.get('triple', {})),
    )


def load_result(path: Path) -> Optional[RunResult]:
    try:
        with open(path, encoding='utf-8') as f:
            d = json.load(f)
        return RunResult(
            dataset=d.get('dataset', 'unknown'),
            model=d.get('model', 'unknown'),
            classifier=d.get('classifier', 'unknown'),
            sample_count=d.get('sampleCount', 0),
            exact=_load_level(d.get('exact', {})),
            semantic=_load_level(d.get('semantic', {})),
            intrinsic_mean=d.get('intrinsicQuality', {}).get('mean', 0.0),
            avg_entities=d.get('extractionStats', {}).get('avgKgEntities', 0.0),
            avg_relations=d.get('extractionStats', {}).get('avgKgRelations', 0.0),
            samples_no_relations=d.get('extractionStats', {}).get('samplesWithNoRelations', 0),
            duration_ms=d.get('durationMs', 0),
            source_file=path.name,
        )
    except Exception as e:
        print(f'Warning: failed to load {path.name}: {e}', file=sys.stderr)
        return None


# ─── Aggregation ──────────────────────────────────────────────────────────────

def _micro_avg_metrics(ms: list[Metrics]) -> Metrics:
    tp = sum(m.tp for m in ms)
    fp = sum(m.fp for m in ms)
    fn = sum(m.fn for m in ms)
    p  = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    r  = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * p * r / (p + r) if (p + r) > 0 else 0.0
    return Metrics(precision=p, recall=r, f1=f1, tp=tp, fp=fp, fn=fn)


def _micro_avg_level(ls: list[LevelMetrics]) -> LevelMetrics:
    return LevelMetrics(
        entity=_micro_avg_metrics([l.entity for l in ls]),
        relation=_micro_avg_metrics([l.relation for l in ls]),
        triple=_micro_avg_metrics([l.triple for l in ls]),
    )


def aggregate(results: list[RunResult]) -> list[RunResult]:
    """Micro-average runs sharing the same (dataset, model, classifier) key."""
    groups: dict[tuple, list[RunResult]] = defaultdict(list)
    for r in results:
        groups[(r.dataset, r.model, r.classifier)].append(r)

    out = []
    for (dataset, model, classifier), group in sorted(groups.items()):
        n = sum(r.sample_count for r in group)
        intrinsic = (
            sum(r.intrinsic_mean * r.sample_count for r in group) / n
            if n > 0 else 0.0
        )
        out.append(RunResult(
            dataset=dataset,
            model=model,
            classifier=classifier,
            sample_count=n,
            exact=_micro_avg_level([r.exact for r in group]),
            semantic=_micro_avg_level([r.semantic for r in group]),
            intrinsic_mean=intrinsic,
            avg_entities=sum(r.avg_entities for r in group) / len(group),
            avg_relations=sum(r.avg_relations for r in group) / len(group),
            samples_no_relations=sum(r.samples_no_relations for r in group),
            duration_ms=sum(r.duration_ms for r in group),
            source_file=f'{len(group)} file(s)',
        ))
    return out


# ─── Charts ───────────────────────────────────────────────────────────────────

CHART_METRICS = [
    ('sem_triple_f1',   'Semantic Triple F1',   lambda r: r.semantic.triple.f1),
    ('sem_entity_f1',   'Semantic Entity F1',   lambda r: r.semantic.entity.f1),
    ('sem_relation_f1', 'Semantic Relation F1', lambda r: r.semantic.relation.f1),
    ('exact_triple_f1', 'Exact Triple F1',      lambda r: r.exact.triple.f1),
]


def make_charts(results: list[RunResult], charts_dir: Path) -> dict[str, str]:
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        import numpy as np
    except ImportError:
        print(
            'Warning: matplotlib not found — charts skipped.\n'
            '         Install with:  pip install matplotlib',
            file=sys.stderr,
        )
        return {}

    charts_dir.mkdir(parents=True, exist_ok=True)
    charts: dict[str, str] = {}
    datasets = sorted(set(r.dataset for r in results))

    # ── Per-dataset, per-metric bar charts ──────────────────────────────────
    for dataset in datasets:
        ds = [r for r in results if r.dataset == dataset]
        models      = sorted(set(r.model for r in ds))
        classifiers = sorted(set(r.classifier for r in ds))
        x     = np.arange(len(models))
        width = 0.8 / max(len(classifiers), 1)

        for metric_key, metric_label, metric_fn in CHART_METRICS:
            fig, ax = plt.subplots(figsize=(max(8, len(models) * 2.2), 5))
            colors = plt.colormaps['tab10'](np.linspace(0, 0.7, len(classifiers)))

            for i, clf in enumerate(classifiers):
                values = [
                    metric_fn(next((r for r in ds if r.model == m and r.classifier == clf), None) or RunResult(
                        dataset='', model='', classifier='', sample_count=0,
                        exact=LevelMetrics(), semantic=LevelMetrics(),
                        intrinsic_mean=0, avg_entities=0, avg_relations=0,
                        samples_no_relations=0, duration_ms=0, source_file='',
                    ))
                    for m in models
                ]
                offset = (i - len(classifiers) / 2 + 0.5) * width
                bars = ax.bar(x + offset, values, width * 0.9, label=clf, color=colors[i])
                for bar, val in zip(bars, values):
                    if val > 0.001:
                        ax.text(
                            bar.get_x() + bar.get_width() / 2,
                            bar.get_height() + 0.008,
                            f'{val:.3f}', ha='center', va='bottom', fontsize=7,
                        )

            ax.set_title(f'{dataset.upper()} — {metric_label}', fontsize=11)
            ax.set_xticks(x)
            ax.set_xticklabels([m.replace(':', '\n') for m in models], fontsize=9)
            ax.set_ylabel('F1 Score')
            ax.set_ylim(0, 1.1)
            ax.legend(title='Classifier', fontsize=8, loc='upper right')
            ax.grid(axis='y', alpha=0.3)
            plt.tight_layout()

            fname = f'{dataset}_{metric_key}.png'
            plt.savefig(charts_dir / fname, dpi=150, bbox_inches='tight')
            plt.close()
            charts[f'{dataset}/{metric_key}'] = f'charts/{fname}'

    # ── Multi-dataset overview: semantic triple F1 ──────────────────────────
    if len(datasets) > 1:
        models      = sorted(set(r.model for r in results))
        classifiers = sorted(set(r.classifier for r in results))
        n_groups    = len(datasets)
        colors      = plt.colormaps['tab10'](np.linspace(0, 0.7, len(models)))

        fig, axes = plt.subplots(
            1, n_groups,
            figsize=(max(12, n_groups * 5), 5),
            sharey=True,
        )
        if n_groups == 1:
            axes = [axes]

        for ax, dataset in zip(axes, datasets):
            ds    = [r for r in results if r.dataset == dataset]
            x     = np.arange(len(classifiers))
            width = 0.8 / max(len(models), 1)

            for i, model in enumerate(models):
                values = [
                    next((r.semantic.triple.f1 for r in ds if r.model == model and r.classifier == clf), 0.0)
                    for clf in classifiers
                ]
                offset = (i - len(models) / 2 + 0.5) * width
                ax.bar(x + offset, values, width * 0.9, label=model, color=colors[i])

            ax.set_title(dataset.upper())
            ax.set_xticks(x)
            ax.set_xticklabels(classifiers, fontsize=9)
            ax.set_ylim(0, 1.1)
            ax.grid(axis='y', alpha=0.3)

        axes[0].set_ylabel('Semantic Triple F1')
        axes[-1].legend(title='Model', fontsize=8, bbox_to_anchor=(1.0, 1.0))
        fig.suptitle('Semantic Triple F1 — All Datasets', fontsize=12)
        plt.tight_layout()
        plt.savefig(charts_dir / 'overview_sem_triple_f1.png', dpi=150, bbox_inches='tight')
        plt.close()
        charts['overview/sem_triple_f1'] = 'charts/overview_sem_triple_f1.png'

    return charts


# ─── Markdown report ──────────────────────────────────────────────────────────

def _f(v: float) -> str:
    return f'{v:.3f}'


def _dur(ms: int) -> str:
    s = ms // 1000
    if s < 60:
        return f'{s}s'
    return f'{s // 60}m {s % 60}s'


def generate_report(results: list[RunResult], charts: dict[str, str], output: Path) -> None:
    datasets = sorted(set(r.dataset for r in results))
    lines: list[str] = []

    lines += [
        f'# Benchmark Report',
        f'',
        f'Generated: {datetime.now().strftime("%Y-%m-%d %H:%M")}  ',
        f'Runs aggregated: {len(results)}  ',
        f'',
    ]

    # Overview chart
    if 'overview/sem_triple_f1' in charts:
        lines += [
            '## Overview',
            '',
            f'![Semantic Triple F1 — All Datasets]({charts["overview/sem_triple_f1"]})',
            '',
        ]

    # Summary table
    lines += [
        '## Summary',
        '',
        '| Dataset | Model | Classifier | n | Sem Ent F1 | Sem Rel F1 | Sem Triple F1 | Exact Triple F1 | Intrinsic | Duration |',
        '|---------|-------|------------|---|------------|------------|---------------|-----------------|-----------|----------|',
    ]
    for r in results:
        lines.append(
            f'| {r.dataset} | `{r.model}` | {r.classifier} | {r.sample_count} '
            f'| {_f(r.semantic.entity.f1)} '
            f'| {_f(r.semantic.relation.f1)} '
            f'| **{_f(r.semantic.triple.f1)}** '
            f'| {_f(r.exact.triple.f1)} '
            f'| {r.intrinsic_mean:.1f} '
            f'| {_dur(r.duration_ms)} |'
        )
    lines.append('')

    # Per-dataset sections
    for dataset in datasets:
        ds = [r for r in results if r.dataset == dataset]
        lines += [f'## {dataset.upper()}', '']

        for metric_key, metric_label, _ in CHART_METRICS:
            key = f'{dataset}/{metric_key}'
            if key in charts:
                lines += [
                    f'### {metric_label}',
                    '',
                    f'![{metric_label}]({charts[key]})',
                    '',
                ]

        lines += [
            '### Detailed Results',
            '',
            '| Model | Classifier | n | Sem P | Sem R | Sem F1 | Exact P | Exact R | Exact F1 | Avg Ent | Avg Rel | No-Rel | Duration |',
            '|-------|------------|---|-------|-------|--------|---------|---------|----------|---------|---------|--------|----------|',
        ]
        for r in ds:
            lines.append(
                f'| `{r.model}` | {r.classifier} | {r.sample_count} '
                f'| {_f(r.semantic.triple.precision)} '
                f'| {_f(r.semantic.triple.recall)} '
                f'| **{_f(r.semantic.triple.f1)}** '
                f'| {_f(r.exact.triple.precision)} '
                f'| {_f(r.exact.triple.recall)} '
                f'| {_f(r.exact.triple.f1)} '
                f'| {r.avg_entities:.1f} '
                f'| {r.avg_relations:.1f} '
                f'| {r.samples_no_relations} '
                f'| {_dur(r.duration_ms)} |'
            )
        lines.append('')

    output.write_text('\n'.join(lines), encoding='utf-8')
    print(f'Report saved to: {output}')


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description='Generate a comparison report from benchmark *.json result files',
    )
    parser.add_argument(
        'dirs', nargs='+',
        help='One or more directories containing benchmark *.json result files',
    )
    parser.add_argument(
        '--output', '-o', default=None,
        help='Output .md path (default: <first dir>/report.md)',
    )
    parser.add_argument(
        '--no-aggregate', action='store_true',
        help='Keep separate rows for runs with the same (dataset, model, classifier)',
    )
    args = parser.parse_args()

    # Load all results
    all_results: list[RunResult] = []
    for dir_str in args.dirs:
        p = Path(dir_str)
        json_files = sorted(p.glob('*.json'))
        if not json_files:
            print(f'Warning: no *.json files in {p}', file=sys.stderr)
        for f in json_files:
            r = load_result(f)
            if r:
                all_results.append(r)

    if not all_results:
        print('Error: no valid benchmark result files found.', file=sys.stderr)
        sys.exit(1)

    print(f'Loaded {len(all_results)} result files')

    if not args.no_aggregate:
        all_results = aggregate(all_results)
        print(f'Aggregated into {len(all_results)} (dataset × model × classifier) groups')

    output = Path(args.output) if args.output else Path(args.dirs[0]) / 'report.md'
    charts_dir = output.parent / 'charts'

    charts = make_charts(all_results, charts_dir)
    if charts:
        print(f'Generated {len(charts)} charts → {charts_dir}')

    generate_report(all_results, charts, output)


if __name__ == '__main__':
    main()
