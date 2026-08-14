-- File 1 of the split external_sync migration. The new enum value must commit
-- before file 2 can reference it in function bodies and CHECKs.

alter type public.completion_source
add value if not exists 'external_sync';
