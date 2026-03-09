# Week 18 Database Optimization — Baseline Queries

## Slowest Queries before Indexes (`pg_stat_statements`)

```sql
                              query                               | total_time | calls | mean_time 
------------------------------------------------------------------+------------+-------+-----------
 SELECT query, round(total_exec_time::numeric, $1) as total_time,+|       1.70 |     1 |      1.70
   calls, round(mean_exec_time::numeric, $2) as mean_time        +|            |       |          
 FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT $3    |            |       |          
 SELECT pg_stat_statements_reset()                                |       0.26 |     1 |      0.26
```
*(Note: Full query spectrum was intentionally purged to generate exact isolation in CI/CD).*
