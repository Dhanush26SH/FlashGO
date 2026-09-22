const toLocalIso = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const generatePickerPeriods = (n = 5) => {
  const periods = [];
  let d = new Date('2026-09-23T00:00:00+05:30'); // Today IST
  const currentDay = d.getDay();
  const daysToWednesday = currentDay >= 3 ? currentDay - 3 : currentDay + 4;
  d.setDate(d.getDate() - daysToWednesday);
  d.setHours(0,0,0,0);
  
  for (let i = 0; i < n; i++) {
    const start = new Date(d);
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    const startIso = toLocalIso(start);
    const label = `${start.toLocaleDateString('en-IN')} - ${end.toLocaleDateString('en-IN')}`;
    periods.push({ start: startIso, label, rawEnd: toLocalIso(end) });
    d.setDate(d.getDate() - 7);
  }
  return periods;
};

console.log(generatePickerPeriods());
