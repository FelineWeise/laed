# Generated once on first apply; stored in Terraform state.
# Rotate by tainting the resource: terraform taint random_password.<name>

resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "random_password" "jwt_secret" {
  length  = 32
  special = false
}

resource "random_password" "minio_access_key" {
  length  = 20
  special = false
}

resource "random_password" "minio_secret_key" {
  length  = 32
  special = false
}

resource "random_password" "litellm_master_key" {
  length  = 32
  special = false
}
