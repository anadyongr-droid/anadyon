import HomePage from "./components/HomePage";

// English at the root; the Greek route renders the same component with a locale.
export default function Page() {
  return <HomePage locale="en" />;
}
