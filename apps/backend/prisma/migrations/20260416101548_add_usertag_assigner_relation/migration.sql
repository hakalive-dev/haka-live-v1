-- AddForeignKey
ALTER TABLE "user_tags" ADD CONSTRAINT "user_tags_assignedBy_fkey" FOREIGN KEY ("assignedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
