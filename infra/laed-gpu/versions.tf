terraform {
  required_version = ">= 1.6.0"

  required_providers {
    scaleway = {
      source  = "scaleway/scaleway"
      version = "~> 2.72"
    }
    postgresql = {
      source  = "cyrilgdn/postgresql"
      version = "~> 1.24"
    }
  }

  backend "s3" {
    bucket                      = "laed-tfstate-prod"
    key                         = "laed-gpu/terraform.tfstate"
    region                      = "fr-par"
    endpoints                   = { s3 = "https://s3.fr-par.scw.cloud" }
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }
}
