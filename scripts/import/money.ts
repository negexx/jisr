import { minorUnitDigits } from "@/lib/format";

// Major units to the integer minor units the data stores (EUR 14650 -> 1465000, HUF 43700 -> 43700).
// The decimal shift is done on the number's text so a float such as 1.005 or 37.8 does not carry
// its binary error into the rounding; halves round away from zero.
export function toMinor(amount: number, currency: string): number {
  const digits = minorUnitDigits(currency);
  const magnitude = Math.abs(amount);
  const shifted = Number(`${magnitude}e${digits}`);
  const scaled = Number.isNaN(shifted) ? magnitude * 10 ** digits : shifted;
  return Math.sign(amount) * Math.round(scaled);
}

export function fromMinor(minor: number, currency: string): number {
  return minor / 10 ** minorUnitDigits(currency);
}
