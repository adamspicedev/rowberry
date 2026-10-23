import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({ links: [{ rel: "canonical", href: "https://rowberry.spicey.dev/" }] }),
  component: Home,
});

const github = "https://github.com/adamspicedev/rowberry";

function Brand() {
  return (
    <a className="brand" href="/" aria-label="Rowberry home">
      <img src="/brand/mark.svg" width="22" height="40" alt="" />
      <span className="wordmark">rowberry</span>
    </a>
  );
}

function Home() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header shell">
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#workspace">The workspace</a>
          <a href="/docs/">Docs</a>
          <a className="github-link" href={github}>
            GitHub <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>
      <main id="main">
        <section className="hero shell">
          <div className="eyebrow">
            <span className="status-dot" /> POSTGRESQL, AT HOME ON YOUR DESKTOP
          </div>
          <h1>
            A little clarity
            <br />
            for your <span>PostgreSQL.</span>
          </h1>
          <p className="hero-copy">
            Find your way through tables, queries, and nested JSON.
            <br className="desktop-break" /> One focused workspace. Right on your machine.
          </p>
          <div className="actions">
            <a className="button primary" href="/docs/getting-started/">
              Get started <span aria-hidden="true">↗</span>
            </a>
            <a className="button secondary" href="#workspace">
              Take a closer look <span aria-hidden="true">↓</span>
            </a>
          </div>
          <p className="release-note">
            Free & open source <span aria-hidden="true">·</span> Early development{" "}
            <span aria-hidden="true">·</span> macOS first
          </p>
          <figure className="product-shot">
            <div className="window-caption">
              <span className="window-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>YOUR DATABASE. YOUR WORKSPACE.</span>
              <span className="local-tag">● Local</span>
            </div>
            <a
              href="/images/workspace.png"
              aria-label="Open full-size Rowberry workspace screenshot"
            >
              <img
                src="/images/workspace.png"
                width="1024"
                height="736"
                alt="Rowberry's dark desktop workspace with saved connections, table and SQL tabs, an editor and a query result."
                fetchPriority="high"
              />
            </a>
            <figcaption>Actual Rowberry workspace, using a local sample database.</figcaption>
          </figure>
        </section>
        <section id="workspace" className="workspace shell section">
          <div className="section-heading">
            <p className="eyebrow">LESS CONTEXT SWITCHING</p>
            <h2>
              Follow the data.
              <br />
              Keep your place.
            </h2>
            <p>
              Move from a table to a query to the JSON inside a row. Keep the work you’re doing
              close at hand.
            </p>
          </div>
          <div className="workflow-list">
            <article>
              <span className="number">01</span>
              <div>
                <h3>Explore your tables</h3>
                <p>
                  Browse schemas, expand columns, and open tables in tabs. Page through rows without
                  loading an entire table into the interface.
                </p>
                <a className="text-link" href="/docs/tables/">
                  Explore tables <span aria-hidden="true">↗</span>
                </a>
              </div>
            </article>
            <article>
              <span className="number">02</span>
              <div>
                <h3>Give every query some space</h3>
                <p>
                  Write SQL with table and column completion. Keep separate tabs, save useful
                  queries, and control transactions explicitly.
                </p>
                <a className="text-link" href="/docs/sql/">
                  Write SQL <span aria-hidden="true">↗</span>
                </a>
              </div>
            </article>
            <article>
              <span className="number">03</span>
              <div>
                <h3>Make sense of nested JSON</h3>
                <p>
                  Explore a tree, filter keys and values, or inspect the source. Edit eligible table
                  values and preview changes before saving.
                </p>
                <a className="text-link" href="/docs/json/">
                  Work with JSON <span aria-hidden="true">↗</span>
                </a>
              </div>
            </article>
          </div>
        </section>
        <section className="json-section">
          <div className="shell section">
            <div className="json-heading">
              <div>
                <p className="eyebrow">THE DETAILS MATTER</p>
                <h2>
                  JSON deserves
                  <br />
                  more than a tiny cell.
                </h2>
              </div>
              <p>
                Bring a document into view without leaving your query. Large numbers and original
                text stay intact, and SQL results stay read only.
              </p>
            </div>
            <figure className="json-shot">
              <a href="/images/json.png" aria-label="Open full-size JSON inspector screenshot">
                <img
                  src="/images/json.png"
                  width="1440"
                  height="928"
                  loading="lazy"
                  alt="Rowberry in light mode with a JSON inspection panel beside a SQL query, including a key and value filter and expandable tree."
                />
              </a>
              <figcaption>The JSON inspector sits beside your work. Sample data shown.</figcaption>
            </figure>
          </div>
        </section>
        <section className="principles shell section">
          <div>
            <p className="eyebrow">LOCAL BY DESIGN</p>
            <h2>
              A database tool.
              <br />
              No account required.
            </h2>
            <p>
              Rowberry connects directly to PostgreSQL. Your connections, saved SQL, and recoverable
              drafts live on your machine.
            </p>
            <a className="text-link" href="/docs/security/">
              Understand the data model <span aria-hidden="true">↗</span>
            </a>
          </div>
          <dl>
            <div>
              <dt>Credentials belong in the vault</dt>
              <dd>
                Remember passwords in your OS credential store when available. Otherwise, keep them
                in memory for the session.
              </dd>
            </div>
            <div>
              <dt>Changes should be deliberate</dt>
              <dd>
                Eligible table edits use a stable row identity and conflict checks. Recovered drafts
                remain copies until you apply them.
              </dd>
            </div>
            <div>
              <dt>Open source, all the way through</dt>
              <dd>
                GPL-3.0-only. No paid tier, desktop telemetry, or Rowberry cloud account. Read the
                code and help shape what comes next.
              </dd>
            </div>
          </dl>
        </section>
        <section className="questions shell section">
          <div>
            <p className="eyebrow">BEFORE YOU BEGIN</p>
            <h2>A few useful details.</h2>
          </div>
          <div className="faq">
            <details>
              <summary>Can I download Rowberry yet?</summary>
              <p>
                Rowberry is in early development. A signed public release is not ready yet; you can
                run it from source. Start with a disposable database while evaluating it.{" "}
                <a href="/docs/getting-started/">Read the setup guide.</a>
              </p>
            </details>
            <details>
              <summary>Which databases and platforms are supported?</summary>
              <p>
                PostgreSQL is the current focus. We’re prioritising macOS on Apple silicon and
                Intel. Windows and Linux packages are build targets, but native desktop
                qualification is deferred. <a href="/docs/status/">See current status.</a>
              </p>
            </details>
            <details>
              <summary>Can I edit data from a query result?</summary>
              <p>
                SQL results are read only. Open a table to edit rows with a stable identity,
                including their JSON values. You’ll review changes before saving them.
              </p>
            </details>
            <details>
              <summary>How can I help?</summary>
              <p>
                Try a workflow, report a reproducible bug, improve the docs, or propose a focused
                change.{" "}
                <a href={`${github}/blob/main/CONTRIBUTING.md`}>
                  Start with the contribution guide.
                </a>
              </p>
            </details>
          </div>
        </section>
        <section className="get-started shell">
          <div>
            <p className="eyebrow">A SMALLER DISTANCE BETWEEN YOU AND YOUR DATA</p>
            <h2>Meet your next workspace.</h2>
            <p>Try Rowberry from source. Bring a little clarity to your next query.</p>
          </div>
          <a className="button primary" href="/docs/getting-started/">
            Get started <span aria-hidden="true">↗</span>
          </a>
        </section>
      </main>
      <footer className="site-footer shell">
        <div>
          <Brand />
          <p>A little clarity for your PostgreSQL.</p>
        </div>
        <nav aria-label="Footer navigation">
          <a href="/docs/">Documentation</a>
          <a href={github}>Source code</a>
          <a href={`${github}/issues`}>Report an issue</a>
          <a href={`${github}/blob/main/LICENSE`}>GPL-3.0-only</a>
        </nav>
        <p className="footer-note">
          Made by <a href="https://www.spicey.dev">Spicey</a>. Built in the open.
        </p>
      </footer>
    </>
  );
}
