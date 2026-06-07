export default function DataTable({ columns, data, onRowClick }) {
  if (!data?.length) {
    return <p className="text-center text-gray-400 py-8">אין נתונים להצגה</p>
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-800/60 text-gray-300 border-b border-gray-700">
            {columns.map(col => (
              <th key={col.key} className="px-4 py-3 text-right font-medium">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={row.id || i}
              onClick={() => onRowClick?.(row)}
              className={`border-b border-gray-800/50 transition-colors
                ${onRowClick ? 'cursor-pointer hover:bg-gray-800/40' : ''}
                ${i % 2 === 0 ? 'bg-gray-900/30' : ''}`}
            >
              {columns.map(col => (
                <td key={col.key} className="px-4 py-3 text-gray-200">
                  {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
