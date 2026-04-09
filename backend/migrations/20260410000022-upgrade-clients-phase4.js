'use strict'

async function getColumns(queryInterface, tableName) {
  try {
    return await queryInterface.describeTable(tableName)
  } catch (_err) {
    return {}
  }
}

async function addColumnIfMissing(queryInterface, tableName, columnName, definition) {
  const columns = await getColumns(queryInterface, tableName)
  if (!columns[columnName]) {
    await queryInterface.addColumn(tableName, columnName, definition)
  }
}

async function removeColumnIfExists(queryInterface, tableName, columnName) {
  const columns = await getColumns(queryInterface, tableName)
  if (columns[columnName]) {
    await queryInterface.removeColumn(tableName, columnName)
  }
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, 'clients', 'province', {
      type: Sequelize.STRING(100),
      allowNull: true,
    })

    await addColumnIfMissing(queryInterface, 'clients', 'postal_code', {
      type: Sequelize.STRING(20),
      allowNull: true,
    })

    await addColumnIfMissing(queryInterface, 'clients', 'country', {
      type: Sequelize.STRING(100),
      allowNull: false,
      defaultValue: 'Pakistan',
    })

    await addColumnIfMissing(queryInterface, 'clients', 'client_type', {
      type: Sequelize.ENUM('individual', 'business'),
      allowNull: false,
      defaultValue: 'business',
    })

    await addColumnIfMissing(queryInterface, 'clients', 'strn', {
      type: Sequelize.STRING(50),
      allowNull: true,
    })

    await addColumnIfMissing(queryInterface, 'clients', 'credit_limit', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: true,
    })

    await addColumnIfMissing(queryInterface, 'clients', 'payment_terms_days', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 30,
    })

    await addColumnIfMissing(queryInterface, 'clients', 'notes', {
      type: Sequelize.TEXT,
      allowNull: true,
    })

    await addColumnIfMissing(queryInterface, 'clients', 'status', {
      type: Sequelize.ENUM('active', 'inactive'),
      allowNull: true,
      defaultValue: 'active',
    })

    await addColumnIfMissing(queryInterface, 'clients', 'deleted_at', {
      type: Sequelize.DATE,
      allowNull: true,
    })

    const columns = await getColumns(queryInterface, 'clients')
    const hasLegacyIsActive = Boolean(columns.is_active)

    if (hasLegacyIsActive) {
      await queryInterface.sequelize.query(`
        UPDATE clients
        SET status = CASE
          WHEN is_active IS TRUE THEN 'active'::"enum_clients_status"
          ELSE 'inactive'::"enum_clients_status"
        END
        WHERE status IS NULL;
      `)
    }

    await queryInterface.sequelize.query(`
      UPDATE clients
      SET
        country = COALESCE(NULLIF(TRIM(country), ''), 'Pakistan'),
        client_type = COALESCE(client_type, 'business'),
        payment_terms_days = COALESCE(payment_terms_days, 30),
        status = COALESCE(status, 'active'::"enum_clients_status");
    `)

    if (hasLegacyIsActive) {
      await removeColumnIfExists(queryInterface, 'clients', 'is_active')
    }

    await queryInterface.changeColumn('clients', 'country', {
      type: Sequelize.STRING(100),
      allowNull: false,
      defaultValue: 'Pakistan',
    })

    await queryInterface.changeColumn('clients', 'client_type', {
      type: Sequelize.ENUM('individual', 'business'),
      allowNull: false,
      defaultValue: 'business',
    })

    await queryInterface.changeColumn('clients', 'payment_terms_days', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 30,
    })

    await queryInterface.changeColumn('clients', 'status', {
      type: Sequelize.ENUM('active', 'inactive'),
      allowNull: false,
      defaultValue: 'active',
    })

    await queryInterface.sequelize.query('DROP INDEX IF EXISTS clients_company_ntn_unique;')
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS clients_company_cnic_unique;')

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS clients_company_ntn_unique
      ON clients (company_id, ntn)
      WHERE ntn IS NOT NULL AND deleted_at IS NULL;
    `)

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS clients_company_cnic_unique
      ON clients (company_id, cnic)
      WHERE cnic IS NOT NULL AND deleted_at IS NULL;
    `)

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS clients_company_name_idx
      ON clients (company_id, name);
    `)

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS clients_company_status_idx
      ON clients (company_id, status);
    `)

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS client_contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(30),
        designation VARCHAR(100),
        is_primary BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS client_contacts_client_id_idx
      ON client_contacts (client_id);
    `)

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS client_contacts_primary_unique_idx
      ON client_contacts (client_id)
      WHERE is_primary IS TRUE;
    `)
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS client_contacts_primary_unique_idx;')
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS client_contacts_client_id_idx;')
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS client_contacts CASCADE;')

    await queryInterface.sequelize.query('DROP INDEX IF EXISTS clients_company_name_idx;')
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS clients_company_status_idx;')
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS clients_company_cnic_unique;')
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS clients_company_ntn_unique;')

    await addColumnIfMissing(queryInterface, 'clients', 'is_active', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    })

    const columns = await getColumns(queryInterface, 'clients')
    if (columns.status) {
      await queryInterface.sequelize.query(`
        UPDATE clients
        SET is_active = CASE
          WHEN status = 'inactive' THEN FALSE
          ELSE TRUE
        END;
      `)
    }

    await removeColumnIfExists(queryInterface, 'clients', 'deleted_at')
    await removeColumnIfExists(queryInterface, 'clients', 'status')
    await removeColumnIfExists(queryInterface, 'clients', 'notes')
    await removeColumnIfExists(queryInterface, 'clients', 'payment_terms_days')
    await removeColumnIfExists(queryInterface, 'clients', 'credit_limit')
    await removeColumnIfExists(queryInterface, 'clients', 'strn')
    await removeColumnIfExists(queryInterface, 'clients', 'client_type')
    await removeColumnIfExists(queryInterface, 'clients', 'country')
    await removeColumnIfExists(queryInterface, 'clients', 'postal_code')
    await removeColumnIfExists(queryInterface, 'clients', 'province')

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS clients_company_ntn_unique
      ON clients (company_id, ntn)
      WHERE ntn IS NOT NULL;
    `)

    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_clients_client_type";')
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_clients_status";')
  },
}
