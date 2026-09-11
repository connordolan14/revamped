# Weekly Power-Ranking Snapshots

The live data build writes one append-only JSON file here after each completed
fantasy week. A snapshot records the ranking that was actually displayed at the
time, including its composite score and the team identity/logo used that week.

Files use the form `YYYY-week-NN.json`. Once a week's file exists, ordinary
builds reuse it byte-for-byte and never replace it. This prevents later roster
value changes from rewriting historical rankings.

These files are source data for a possible future week-over-week chart. There is
currently no chart or other power-history UI.
