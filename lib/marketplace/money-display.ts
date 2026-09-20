export function formatPaisaExact(value:number):string {
 if(!Number.isSafeInteger(value))throw new RangeError('Invalid money value.');
 const amount=BigInt(value),negative=amount<BigInt(0),absolute=negative?-amount:amount;
 return (negative?'-':'')+'NPR '+new Intl.NumberFormat('en-NP',{maximumFractionDigits:0}).format(absolute/BigInt(100))+'.'+String(absolute%BigInt(100)).padStart(2,'0');
}
