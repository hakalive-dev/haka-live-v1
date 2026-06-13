-- CreateTable
CREATE TABLE "moment_comment_likes" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moment_comment_likes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "moment_comment_likes_commentId_userId_key" ON "moment_comment_likes"("commentId", "userId");

-- AddForeignKey
ALTER TABLE "moment_comment_likes" ADD CONSTRAINT "moment_comment_likes_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "moment_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_comment_likes" ADD CONSTRAINT "moment_comment_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
