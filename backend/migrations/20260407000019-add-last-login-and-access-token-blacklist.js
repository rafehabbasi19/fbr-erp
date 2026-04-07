'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const usersTable = await queryInterface.describeTable('users')

    if (!usersTable.last_login_at) {
      await queryInterface.addColumn('users', 'last_login_at', {
        type: Sequelize.DATE,
        allowNull: true,
      })
    }

    await queryInterface.createTable('access_token_blacklist', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
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

    await queryInterface.addIndex('access_token_blacklist', ['token_hash'])
    await queryInterface.addIndex('access_token_blacklist', ['expires_at'])
  },

  async down(queryInterface) {
    await queryInterface.dropTable('access_token_blacklist')

    const usersTable = await queryInterface.describeTable('users')
    if (usersTable.last_login_at) {
      await queryInterface.removeColumn('users', 'last_login_at')
    }
  },
}
