export function roundPrecision(x, prec) {
  return prec * Math.round((1 / prec) * x)
}

