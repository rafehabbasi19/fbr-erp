'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('fbr_api_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      invoice_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'invoices', key: 'id' },
        onDelete: 'SET NULL',
      },
      request_payload_hash: {
        type: Sequelize.STRING(64),
        allowNull: true,
        comment: 'SHA-256 of request payload — never store raw payload',
      },
      response_status: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'HTTP status code from FBR',
      },
      fbr_invoice_number: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    })

    await queryInterface.addIndex('fbr_api_logs', ['company_id'])
    await queryInterface.addIndex('fbr_api_logs', ['invoice_id'])
  },

  async down(queryInterface) {
    await queryInterface.dropTable('fbr_api_logs')
  },
}
