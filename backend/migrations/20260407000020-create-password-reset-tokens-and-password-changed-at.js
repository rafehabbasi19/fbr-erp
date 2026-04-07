'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const usersTable = await queryInterface.describeTable('users')

    if (!usersTable.password_changed_at) {
      await queryInterface.addColumn('users', 'password_changed_at', {
        type: Sequelize.DATE,
        allowNull: true,
      })
    }

    await queryInterface.createTable('password_reset_tokens', {
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      token_hash: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    })

    await queryInterface.addIndex('password_reset_tokens', ['email'])
    await queryInterface.addIndex('password_reset_tokens', ['expires_at'])
  },

  async down(queryInterface) {
    await queryInterface.dropTable('password_reset_tokens')

    const usersTable = await queryInterface.describeTable('users')
    if (usersTable.password_changed_at) {
      await queryInterface.removeColumn('users', 'password_changed_at')
    }
  },
}
