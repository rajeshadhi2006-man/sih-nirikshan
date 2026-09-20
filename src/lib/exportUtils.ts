// ========================================================================
// EXPORT UTILITIES (CSV & PDF/Print)
// ========================================================================

/**
 * Downloads data as a CSV file in the browser
 */
export function exportToCSV(filename: string, rows: Record<string, any>[]) {
  if (!rows || !rows.length) {
    alert('No data available to export.');
    return;
  }

  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const val = row[header];
          if (val === null || val === undefined) return '""';
          const stringVal = String(val).replace(/"/g, '""');
          return `"${stringVal}"`;
        })
        .join(',')
    ),
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Triggers clean browser print dialog formatted for official government reporting
 */
export function printReport(title: string) {
  const originalTitle = document.title;
  document.title = `${title} - Government of India Official Report`;
  window.print();
  document.title = originalTitle;
}
