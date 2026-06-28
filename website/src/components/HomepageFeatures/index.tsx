import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  emoji: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Provenance, not just facts',
    emoji: '🔍',
    description: (
      <>
        Every observation records its <code>source</code>/<code>speaker</code> and a
        Graphiti-style bi-temporal axis. The same fact from two speakers stays as two
        attributed observations, never one flattened string.
      </>
    ),
  },
  {
    title: 'A grounding gate',
    emoji: '🛡️',
    description: (
      <>
        Each extracted fact is scored against its source chunk and can be flagged or
        dropped before it reaches the output — keyword overlap, with an optional local
        NLI checker. It won't record what it can't verify.
      </>
    ),
  },
  {
    title: 'Local-first',
    emoji: '🏠',
    description: (
      <>
        Runs on local models via Ollama by default — nothing leaves the box unless you
        opt in. Point generation at any OpenAI-compatible endpoint while embeddings stay
        local and free.
      </>
    ),
  },
];

function Feature({title, emoji, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center" style={{fontSize: '3rem'}} aria-hidden="true">
        {emoji}
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
