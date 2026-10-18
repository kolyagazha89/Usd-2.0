-- Preserve historical rows, including existing duplicates. Reject new conflicts
-- at the database boundary for every writer (cabinet, staff and imports).
CREATE FUNCTION usd_plate_identity(country "RegistrationCountry", plate text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT regexp_replace(
    CASE WHEN country = 'RU' THEN
      translate(upper(normalize(plate, NFKC)), 'ABEKMHOPCTYX', 'АВЕКМНОРСТУХ')
    ELSE upper(normalize(plate, NFKC)) END,
    '[^[:alnum:]]', '', 'g');
$$;

CREATE INDEX "Car_plate_identity_idx"
  ON "Car" ("registrationCountry", usd_plate_identity("registrationCountry", "registrationNumber"));

CREATE FUNCTION usd_guard_car_plate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE identity text;
BEGIN
  identity := usd_plate_identity(NEW."registrationCountry", NEW."registrationNumber");
  IF identity = '' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW."registrationCountry" = OLD."registrationCountry"
     AND identity = usd_plate_identity(OLD."registrationCountry", OLD."registrationNumber") THEN
    RETURN NEW;
  END IF;
  -- READ COMMITTED obtains a fresh snapshot after waiting for the first writer.
  -- SERIALIZABLE writers additionally retain PostgreSQL conflict detection.
  PERFORM pg_advisory_xact_lock(hashtextextended('usd-car-plate:' || NEW."registrationCountry"::text || ':' || identity, 0));
  IF EXISTS (SELECT 1 FROM "Car" c
    WHERE c.id <> NEW.id AND c."registrationCountry" = NEW."registrationCountry"
      AND usd_plate_identity(c."registrationCountry", c."registrationNumber") = identity) THEN
    RAISE EXCEPTION 'Автомобиль с таким госномером уже существует'
      USING ERRCODE = '23505', CONSTRAINT = 'Car_plate_identity_unique';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Car_guard_plate_identity"
  BEFORE INSERT OR UPDATE OF "registrationCountry", "registrationNumber" ON "Car"
  FOR EACH ROW EXECUTE FUNCTION usd_guard_car_plate();
