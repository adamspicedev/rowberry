import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import styles from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Rowberry — A little clarity for your PostgreSQL" },
      {
        name: "description",
        content:
          "A free, open-source desktop workspace for PostgreSQL. Browse tables, write SQL, and inspect and edit JSON. Local by design. Currently in early development.",
      },
      { property: "og:title", content: "Rowberry — A little clarity for your PostgreSQL" },
      {
        property: "og:description",
        content: "Tables, SQL and JSON. One local PostgreSQL workspace. Free and open source.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://rowberry.spicey.dev/" },
      { property: "og:image", content: "https://rowberry.spicey.dev/images/workspace.png" },
      { name: "theme-color", content: "#f8f7f2" },
    ],
    links: [
      { rel: "stylesheet", href: styles },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
  }),
  component: Root,
  notFoundComponent: () => (
    <main className="not-found">
      <a className="wordmark" href="/">
        rowberry
      </a>
      <p className="eyebrow">404 · PAGE NOT FOUND</p>
      <h1>Nothing in this row.</h1>
      <p>The page may have moved. Head back to the website or find what you need in the docs.</p>
      <div className="actions">
        <a className="button primary" href="/">
          Back to Rowberry
        </a>
        <a className="button secondary" href="/docs/">
          Read the docs
        </a>
      </div>
    </main>
  ),
});

function Root() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
