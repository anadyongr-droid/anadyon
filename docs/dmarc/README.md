# DMARC aggregate reports

Real reports, kept as fixtures for `scripts/read-dmarc.mjs` and as the evidence
behind open item **E9** (whether `_dmarc.anadyon.gr` can move off `p=none`).

These are our own data — the source IPs that sent as `anadyon.gr`, their volumes
and their authentication results. No customer content: an aggregate report
carries counts and IPs, never message bodies, subjects or addresses.

**Where they come from.** Receivers send them daily to the `rua=` address in
`_dmarc.anadyon.gr`, which is `customerservice@anadyon.gr`. Until 19 September
2026 every one of them was being deleted unread; twenty-plus were found in the
Gmail bin, from Microsoft, Google, Yahoo, AOL and GMX. Gmail purges its bin after
30 days, so anything not saved is lost on a rolling basis.

```
node scripts/read-dmarc.mjs docs/dmarc/*.xml.gz
```

**One report is not an answer.** Each covers one receiver for one day, so a
clean file means only that this receiver saw nothing wrong that day. Collect a
week across several receivers before drawing a conclusion about `p=quarantine`.
