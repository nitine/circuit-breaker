import { Link } from "@tanstack/react-router";

export function Topbar({ right, dark = true }: { right?: React.ReactNode; dark?: boolean }) {
  return (
    <div className="topbar" style={{ color: dark ? "#fff" : "#1a1410" }}>
      <Link to="/" className="brand" style={{ textDecoration: "none" }}>⚡ CIRCUIT BREAKER</Link>
      <nav>
        {right ?? (<><Link to="/how">How it works</Link><a href="https://github.com/nitine/circuit-breaker" target="_blank" rel="noreferrer">GitHub</a><Link to="/drill/new" className="px-btn" style={{ padding: "8px 14px", fontSize: 11 }}>Start a drill</Link></>)}
      </nav>
    </div>
  );
}
