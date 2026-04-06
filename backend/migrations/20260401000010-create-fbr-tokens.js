'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('fbr_tokens', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      token_encrypted: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'AES-256-GCM encrypted. Format: iv:authTag:ciphertext (base64). NEVER expose in API.',
      },
      pos_id: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'FBR Point-of-Sale ID',
      },
      environment: {
        type: Sequelize.ENUM('sandbox', 'production'),
        allowNull: false,
        defaultValue: 'sandbox',
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('fbr_tokens')
  },
}
