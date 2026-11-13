# Bench A/B: v2.0.2 vs stage-0

- A: `cc7df3e6d986`; B: `65177c83e970`
- Machine: Apple M5 Pro, 18 cores, 64 GB, darwin 25.6.0 arm64; Node v22.23.2
- Date: 2026-11-13T09:25:40.496Z to 2026-11-13T09:28:51.780Z
- Load average (1/5/15 min): start 3.73 6.32 7.82, end 4.91 5.81 7.32
- 5 rounds, interleaved A/B, one fresh process per case and side. Spread is the larger side's (max-min)/median.

| Benchmark | A median ops/s | B median ops/s | Δ % | Spread % (A / B) | IQR % (A / B) | |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| number add | 8,135,154 | 8,031,521 | -1.3 | 14.5 / 17.3 | 11.3 / 10.3 | noise: spread > Δ |
| number multiply (scaled) | 12,075,256 | 12,148,998 | +0.6 | 8.0 / 7.0 | 4.5 / 1.5 | noise: spread > Δ |
| number allocate [1,2,3,4] | 1,628,270 | 1,631,414 | +0.2 | 9.2 / 8.0 | 2.4 / 5.2 | noise: spread > Δ |
| number convert USD->EUR | 8,071,117 | 8,204,531 | +1.7 | 4.4 / 28.0 | 1.5 / 9.3 | noise: spread > Δ |
| number toDecimal | 3,209,065 | 3,240,052 | +1.0 | 4.8 / 28.0 | 3.2 / 11.1 | noise: spread > Δ |
| bigint add | 7,372,695 | 6,691,440 | -9.2 | 28.8 / 30.5 | 23.1 / 26.8 | noise: spread > Δ |
| bigint multiply (scaled) | 12,733,131 | 13,099,647 | +2.9 | 17.5 / 10.0 | 4.9 / 2.5 | noise: spread > Δ |
| bigint allocate [1,2,3,4] | 1,484,449 | 1,448,217 | -2.4 | 6.7 / 5.2 | 3.3 / 2.9 | noise: spread > Δ |
| bigint convert USD->EUR | 8,722,548 | 7,842,831 | -10.1 | 16.1 / 12.8 | 7.3 / 4.8 | noise: spread > Δ |
| bigint toDecimal | 3,150,178 | 3,015,730 | -4.3 | 22.3 / 29.2 | 3.6 / 10.6 | noise: spread > Δ |

10 of 10 deltas are smaller than their spread.
