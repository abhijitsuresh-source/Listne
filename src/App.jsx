import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { invoke } from "./lib/tauri";
import Layout from "./components/Layout";
import Activate from "./pages/Activate";
import Setup from "./pages/Setup";
import Dashboard from "./pages/Dashboard";
import Record from "./pages/Record";
import MeetingDetail from "./pages/MeetingDetail";

export default function App() {
  const [licensed, setLicensed] = useState(null); // null = loading

  useEffect(() => {
    invoke("check_license").then(setLicensed).catch(() => setLicensed(false));
  }, []);

  if (licensed === null) {
    return (
      <div className="h-full flex items-center justify-center bg-vault-bg">
        <div className="font-mono text-vault-text-dim text-sm animate-pulse">loading listne...</div>
      </div>
    );
  }

  if (!licensed) {
    return <Activate onActivated={() => setLicensed(true)} />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/record" element={<Record />} />
        <Route path="/meeting/:id" element={<MeetingDetail />} />
      </Routes>
    </Layout>
  );
}
