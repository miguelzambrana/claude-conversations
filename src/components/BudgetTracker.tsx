import { useState, useEffect } from 'react';

const STORAGE_KEY = 'claude-monthly-budget';

interface AnalyticsResp {
  thisMonthCost: number;
}

export default function BudgetTracker() {
  const [budget,  setBudget]  = useState<number | null>(null);
  const [spent,   setSpent]   = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [input,   setInput]   = useState('');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setBudget(parseFloat(stored));

    fetch('/api/analytics')
      .then(r => r.json())
      .then((d: AnalyticsResp) => setSpent(d.thisMonthCost))
      .catch(() => {});
  }, []);

  function saveBudget() {
    const val = parseFloat(input);
    if (!isNaN(val) && val > 0) {
      setBudget(val);
      localStorage.setItem(STORAGE_KEY, String(val));
    } else if (input === '' || input === '0') {
      setBudget(null);
      localStorage.removeItem(STORAGE_KEY);
    }
    setEditing(false);
  }

  const month = new Date().toLocaleString('en-US', { month: 'short' });

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500">Budget $</span>
        <input
          type="number"
          min="0"
          step="1"
          autoFocus
          className="w-16 rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-xs text-gray-200 outline-none focus:border-blue-500"
          placeholder="20"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') saveBudget(); if (e.key === 'Escape') setEditing(false); }}
          onBlur={saveBudget}
        />
      </div>
    );
  }

  if (spent === null) return null;

  if (budget === null) {
    return (
      <button
        onClick={() => { setEditing(true); setInput(''); }}
        className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
        title="Set monthly budget"
      >
        {month}: <span className="font-mono text-emerald-700">${spent.toFixed(2)}</span>
      </button>
    );
  }

  const pct   = Math.min((spent / budget) * 100, 100);
  const over  = spent > budget;
  const color = over ? 'bg-red-500' : pct > 80 ? 'bg-yellow-500' : 'bg-emerald-500';

  return (
    <button
      onClick={() => { setEditing(true); setInput(String(budget)); }}
      className="flex items-center gap-2 group"
      title={`${month}: $${spent.toFixed(3)} / $${budget} — click to edit budget`}
    >
      <span className="text-xs text-gray-500 hidden sm:inline">
        {month}
      </span>
      <div className="w-20 h-1.5 rounded-full bg-gray-700 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-mono ${over ? 'text-red-400' : 'text-emerald-500'}`}>
        ${spent.toFixed(2)}<span className="text-gray-600">/${budget}</span>
      </span>
    </button>
  );
}
