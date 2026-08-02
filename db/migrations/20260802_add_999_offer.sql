DO $$
DECLARE
  target_iid text := 'biography__999';
  body text := $$<p>You explain the website you want. We build that website, not the closest version a template allows.</p>
<p>We can charge less because the technology has moved on, not because the work is generic. The price covers the website agreed after a one-hour recorded discovery conversation and one structured round of changes.</p>

<p><strong>Included (summary)</strong><br>
• Up to 5 core pages (for example: Home, About, Services, Offer, Contact)<br>
• Mobile-friendly layouts for desktop, tablet and phone<br>
• Basic technical and on‑page SEO setup<br>
• One one‑hour recorded discovery conversation to agree the brief<br>
• One structured round of changes after the first complete draft</p>

<p><strong>Change control</strong> — The £999 price covers the website agreed after the discovery conversation and one structured round of changes. Additional pages, functionality, integrations or further changes are quoted separately before any extra work begins.</p>$$;
  heading text := 'A genuinely bespoke website — from £999';
  arr jsonb;
  elems text[];
  new_elems text[];
  closing_iid text := null;
  idx integer;
  btntext text;
  elem text;
BEGIN
  -- Insert heading if missing
  INSERT INTO content (section_key, content)
  VALUES (target_iid || '.heading', heading)
  ON CONFLICT (section_key) DO NOTHING;

  -- Insert body if missing
  INSERT INTO content (section_key, content)
  VALUES (target_iid || '.body', body)
  ON CONFLICT (section_key) DO NOTHING;

  -- get section_order for page
  SELECT section_order INTO arr FROM pages WHERE slug = 'websites-and-ai' LIMIT 1;
  IF arr IS NULL THEN
    RAISE NOTICE 'websites-and-ai page not found; aborting section_order update';
    RETURN;
  END IF;

  -- convert jsonb array to text[]
  SELECT array_agg(elem) INTO elems
  FROM jsonb_array_elements_text(arr) WITH ORDINALITY t(elem, ord)
  ORDER BY ord;

  -- find closing intervention instance with the specific button_text in that page's order
  IF elems IS NOT NULL THEN
    FOR idx IN array_lower(elems,1)..array_upper(elems,1) LOOP
      SELECT content INTO btntext FROM content WHERE section_key = elems[idx] || '.button_text' LIMIT 1;
      IF btntext = 'Book a 30 minute conversation' THEN
        closing_iid := elems[idx];
        EXIT;
      END IF;
    END LOOP;
  END IF;

  -- If target already present in section_order, skip
  IF elems IS NOT NULL THEN
    FOREACH elem IN ARRAY elems LOOP
      IF elem = target_iid THEN
        RAISE NOTICE 'Target iid (%) already in section_order; nothing to do', target_iid;
        RETURN;
      END IF;
    END LOOP;
  END IF;

  IF closing_iid IS NULL THEN
    -- fallback: append to the end
    new_elems := elems || ARRAY[target_iid];
  ELSE
    -- build new array inserting target before closing_iid
    new_elems := ARRAY[]::text[];
    FOR idx IN array_lower(elems,1)..array_upper(elems,1) LOOP
      IF elems[idx] = closing_iid THEN
        new_elems := new_elems || ARRAY[target_iid];
      END IF;
      new_elems := new_elems || ARRAY[elems[idx]];
    END LOOP;
  END IF;

  -- update pages.section_order
  UPDATE pages SET section_order = to_jsonb(new_elems) WHERE slug = 'websites-and-ai';

  -- Update closing CTA text
  IF closing_iid IS NOT NULL THEN
    UPDATE content SET content = 'Tell us what you want to build' WHERE section_key = closing_iid || '.button_text';
  ELSE
    -- no closing found: attempt to find last intervention in elems and update
    IF elems IS NOT NULL THEN
      FOR idx IN array_upper(elems,1) .. array_lower(elems,1) BY -1 LOOP
        IF elems[idx] LIKE 'intervention%' THEN
          UPDATE content SET content = 'Tell us what you want to build' WHERE section_key = elems[idx] || '.button_text';
          EXIT;
        END IF;
      END LOOP;
    END IF;
  END IF;

  RAISE NOTICE 'Inserted % and updated CTA', target_iid;
END $$;
