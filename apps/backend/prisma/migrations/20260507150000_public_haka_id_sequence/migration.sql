-- Dedicated sequence for new user public Haka IDs (starts at 500000001; independent of MAX(users.hakaId)).
CREATE SEQUENCE IF NOT EXISTS "public_haka_id_seq"
  AS BIGINT
  INCREMENT BY 1
  MINVALUE 500000001
  START WITH 500000001
  OWNED BY NONE;
