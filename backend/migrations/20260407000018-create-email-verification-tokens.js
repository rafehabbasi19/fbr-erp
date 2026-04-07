'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('email_verification_tokens', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      token_hash: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
      },
      purpose: {
        type: Sequelize.ENUM('register', 'resend'),
        allowNull: false,
        defaultValue: 'register',
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      used_at: {
        type: Sequelize.DATE,
        allowNull: true,
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

    await queryInterface.addIndex('email_verification_tokens', ['user_id'])
    await queryInterface.addIndex('email_verification_tokens', ['purpose', 'created_at'])
    await queryInterface.addIndex('email_verification_tokens', ['expires_at'])
  },

  async down(queryInterface) {
    await queryInterface.dropTable('email_verification_tokens')
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_email_verification_tokens_purpose";'
    )
  },
}
