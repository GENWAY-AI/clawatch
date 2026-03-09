import SessionClient from "./SessionClient";

export async function generateStaticParams() {
  return [];
}

export default function Page() {
  return <SessionClient />;
}
