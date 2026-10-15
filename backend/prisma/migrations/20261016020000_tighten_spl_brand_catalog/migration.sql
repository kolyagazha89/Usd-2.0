-- Tighten the participant-facing catalog to brands with a clear SPL / competition-car-audio focus.
-- Keep entries and historical configuration snapshots; deactivate out-of-scope options instead of deleting them.
-- Batteries and alternators remain spec-based fields, not brand/model catalog entries.

WITH settings AS (
  SELECT "id", COALESCE("catalogs", '{}'::jsonb) AS catalogs
  FROM "SiteSettings"
  WHERE "id" = 'default'
),
brand_rows AS (
  SELECT s."id", item
  FROM settings s,
       LATERAL jsonb_array_elements(COALESCE(s.catalogs->'componentBrands', '[]'::jsonb)) item
),
brand_updates AS (
  SELECT "id",
         jsonb_agg(
           CASE
             WHEN
               ((item->>'category') = 'HEAD_UNIT' AND lower(item->>'name') IN ('pioneer','alpine','kenwood'))
               OR ((item->>'category') = 'AUDIO_COMPONENT' AND lower(item->>'name') IN ('deaf bonce','pride','avatar','dynamic state','dl audio','ural','ground zero','hannibal'))
               OR ((item->>'category') = 'SUBWOOFER' AND lower(item->>'name') IN ('deaf bonce','pride','avatar','sundown audio','dd audio','american bass','b2 audio'))
               OR ((item->>'category') = 'AMPLIFIER' AND lower(item->>'name') IN ('deaf bonce','pride','avatar','sundown audio','dd audio','taramps','b2 audio','american bass','dynamic state','dl audio','ural'))
               OR ((item->>'category') = 'DSP' AND lower(item->>'name') IN ('deaf bonce','ground zero','taramps','dynamic state'))
             THEN jsonb_set(item, '{isActive}', 'true'::jsonb, true)
             ELSE jsonb_set(item, '{isActive}', 'false'::jsonb, true)
           END
           ORDER BY item->>'category', item->>'name'
         ) AS brands
  FROM brand_rows
  GROUP BY "id"
),
model_rows AS (
  SELECT s."id", item
  FROM settings s,
       LATERAL jsonb_array_elements(COALESCE(s.catalogs->'componentModels', '[]'::jsonb)) item
),
model_updates AS (
  SELECT "id",
         jsonb_agg(
           CASE
             WHEN
               ((item->>'category') = 'HEAD_UNIT' AND lower(item->>'brand') IN ('pioneer','alpine','kenwood'))
               OR ((item->>'category') = 'AUDIO_COMPONENT' AND lower(item->>'brand') IN ('deaf bonce','pride','avatar','dynamic state','dl audio','ural','ground zero','hannibal'))
               OR ((item->>'category') = 'SUBWOOFER' AND lower(item->>'brand') IN ('deaf bonce','pride','avatar','sundown audio','dd audio','american bass','b2 audio'))
               OR ((item->>'category') = 'AMPLIFIER' AND lower(item->>'brand') IN ('deaf bonce','pride','avatar','sundown audio','dd audio','taramps','b2 audio','american bass','dynamic state','dl audio','ural'))
               OR ((item->>'category') = 'DSP' AND lower(item->>'brand') IN ('deaf bonce','ground zero','taramps','dynamic state'))
             THEN item
             ELSE jsonb_set(item, '{isActive}', 'false'::jsonb, true)
           END
           ORDER BY item->>'category', item->>'brand', item->>'model'
         ) AS models
  FROM model_rows
  GROUP BY "id"
),
with_hannibal AS (
  SELECT s."id",
         CASE
           WHEN EXISTS (
             SELECT 1
             FROM jsonb_array_elements(COALESCE(s.catalogs->'componentBrands', '[]'::jsonb)) b
             WHERE b->>'category' = 'AUDIO_COMPONENT' AND lower(b->>'name') = 'hannibal'
           )
           THEN bu.brands
           ELSE bu.brands || jsonb_build_array(jsonb_build_object(
             'id', 'spl-brand-audio_component-hannibal',
             'category', 'AUDIO_COMPONENT',
             'name', 'Hannibal',
             'isActive', true,
             'sourceType', 'MANUFACTURER_CATALOG'
           ))
         END AS brands,
         mu.models
  FROM settings s
  JOIN brand_updates bu ON bu."id" = s."id"
  JOIN model_updates mu ON mu."id" = s."id"
)
UPDATE "SiteSettings" s
SET "catalogs" = jsonb_set(
  jsonb_set(COALESCE(s."catalogs", '{}'::jsonb), '{componentBrands}', h.brands, true),
  '{componentModels}', h.models, true
)
FROM with_hannibal h
WHERE s."id" = h."id";
