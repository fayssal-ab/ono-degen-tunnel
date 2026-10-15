-- What a drawn giveaway winner writes in Kick chat while they're 'waiting',
-- captured server-side by the Kick chat webhook. Backs up the dashboard's
-- browser socket so the 15 s answer is seen even if that socket is down.
CREATE TABLE IF NOT EXISTS giveaway_winner_chat (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  winner_id   BIGINT       NOT NULL,
  content     VARCHAR(500) NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_winner_chat (winner_id, id),
  CONSTRAINT fk_winner_chat FOREIGN KEY (winner_id) REFERENCES giveaway_winners(id) ON DELETE CASCADE
) ENGINE=InnoDB;
