'use client';

import React, { useState, useMemo } from 'react';

export default function DEGTable({ consensusResults = [], onGeneSelect }) {
  // Helper to extract min valid p-value from pvalues array
  const getMinPvalue = (pvalues) => {
    if (!pvalues || !Array.isArray(pvalues) || pvalues.length === 0) return 1;
    const valid = pvalues.filter(p => p > 0 && isFinite(p));
    return valid.length > 0 ? Math.min(...valid) : 1;
  };
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortConfig, setSortConfig] = useState({ key: 'consensusScore', direction: 'desc' });
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;

  const categories = ['All', 'High Confidence', 'Moderate Confidence', 'Method-Sensitive', 'Not Significant'];

  const categoryMap = {
    'High Confidence': 'high_confidence',
    'Moderate Confidence': 'moderate_confidence',
    'Method-Sensitive': 'method_sensitive',
    'Not Significant': 'not_significant'
  };

  const filteredData = useMemo(() => {
    return consensusResults.filter(gene => {
      const matchesSearch = gene.geneName.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'All' || gene.category === categoryMap[categoryFilter];
      return matchesSearch && matchesCategory;
    }).sort((a, b) => {
      const aVal = sortConfig.key === 'pvalue' ? getMinPvalue(a.pvalues) : (a[sortConfig.key] || 0);
      const bVal = sortConfig.key === 'pvalue' ? getMinPvalue(b.pvalues) : (b[sortConfig.key] || 0);
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [consensusResults, search, categoryFilter, sortConfig]);

  const paginatedData = filteredData.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const totalPages = Math.ceil(filteredData.length / rowsPerPage) || 1;

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const downloadCSV = () => {
    const headers = ['Gene Name', 'Consensus Score', 'Category', 'Median Log2FC', 'P-value'];
    const csvData = filteredData.map(g => [
      g.geneName,
      g.consensusScore,
      g.category,
      g.log2fc_median?.toFixed(2) || '',
      (getMinPvalue(g.pvalues)).toExponential(2)
    ]);
    
    const csvContent = [headers.join(','), ...csvData.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'deg_results.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getCategoryColor = (cat) => {
    switch (cat) {
      case 'high_confidence': return 'bg-emerald-500/20 text-emerald-600';
      case 'moderate_confidence': return 'bg-amber-500/20 text-amber-600';
      case 'method_sensitive': return 'bg-orange-500/20 text-orange-600';
      case 'not_significant':
      default: return 'bg-slate-500/20 text-slate-500';
    }
  };

  return (
    <div className="flex flex-col space-y-4 text-slate-800">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <input 
          type="text" 
          placeholder="Search gene..." 
          className="bg-white border border-slate-200 rounded-md px-4 py-2 focus:outline-none focus:border-cyan-500"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <div className="flex gap-4">
          <select 
            className="bg-white border border-slate-200 rounded-md px-4 py-2 focus:outline-none focus:border-cyan-500"
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          >
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button 
            onClick={downloadCSV}
            className="bg-slate-200 hover:bg-slate-300 px-4 py-2 rounded-md transition-colors"
          >
            Download CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 cursor-pointer hover:text-black" onClick={() => requestSort('geneName')}>Gene</th>
              <th className="px-4 py-3 cursor-pointer hover:text-black" onClick={() => requestSort('consensusScore')}>Score</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 cursor-pointer hover:text-black" onClick={() => requestSort('log2fc_median')}>Log2FC</th>
              <th className="px-4 py-3 cursor-pointer hover:text-black" onClick={() => requestSort('pvalue')}>P-value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {paginatedData.map(gene => (
              <tr key={gene.geneName} className="hover:bg-slate-100 cursor-pointer transition-colors" onClick={() => onGeneSelect && onGeneSelect(gene.geneName)}>
                <td className="px-4 py-3 font-medium text-sky-600">{gene.geneName}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6">{gene.consensusScore}</span>
                    <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-sky-600" style={{ width: `${(gene.consensusScore / 6) * 100}%` }}></div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${getCategoryColor(gene.category)}`}>
                    {gene.category}
                  </span>
                </td>
                <td className="px-4 py-3">{gene.log2fc_median?.toFixed(3) || '-'}</td>
                <td className="px-4 py-3">{getMinPvalue(gene.pvalues).toExponential(2)}</td>
              </tr>
            ))}
            {paginatedData.length === 0 && (
              <tr>
                <td colSpan="5" className="px-4 py-8 text-center text-slate-500">No genes found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center text-sm text-slate-500">
        <div>Showing {((page - 1) * rowsPerPage) + 1} to {Math.min(page * rowsPerPage, filteredData.length)} of {filteredData.length} entries</div>
        <div className="flex gap-2">
          <button 
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="px-3 py-1 rounded bg-white hover:bg-slate-200 disabled:opacity-50"
          >
            Prev
          </button>
          <span className="px-3 py-1">Page {page} of {totalPages}</span>
          <button 
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 rounded bg-white hover:bg-slate-200 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
