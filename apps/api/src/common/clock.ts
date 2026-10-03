/** Sumber waktu yang bisa diganti di tes, mis. untuk menghitung data basi. */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = {
  now: () => new Date(),
};
