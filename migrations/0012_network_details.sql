ALTER TABLE network_snapshots ADD COLUMN ais_uptime TEXT;
ALTER TABLE network_snapshots ADD COLUMN true_uptime TEXT;
ALTER TABLE network_agent_state ADD COLUMN dhcp_leases_json TEXT;
