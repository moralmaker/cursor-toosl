ALTER TABLE model_configs ADD COLUMN custom_input_cost_per_million REAL CHECK (custom_input_cost_per_million IS NULL OR custom_input_cost_per_million >= 0);
ALTER TABLE model_configs ADD COLUMN custom_output_cost_per_million REAL CHECK (custom_output_cost_per_million IS NULL OR custom_output_cost_per_million >= 0);
ALTER TABLE model_configs ADD COLUMN custom_cache_read_cost_per_million REAL CHECK (custom_cache_read_cost_per_million IS NULL OR custom_cache_read_cost_per_million >= 0);
ALTER TABLE model_configs ADD COLUMN custom_cache_write_cost_per_million REAL CHECK (custom_cache_write_cost_per_million IS NULL OR custom_cache_write_cost_per_million >= 0);
