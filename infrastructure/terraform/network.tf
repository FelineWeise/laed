# =============================================================================
# VPC + Private Network
# =============================================================================

resource "scaleway_vpc" "main" {
  name   = "${var.project_name}-vpc"
  region = var.scw_region
  tags   = ["terraform", var.project_name]
}

resource "scaleway_vpc_private_network" "main" {
  name   = "${var.project_name}-internal"
  vpc_id = scaleway_vpc.main.id
  region = var.scw_region
  tags   = ["terraform", var.project_name]

  ipv4_subnet {
    subnet = "172.16.16.0/22"
  }
}

# =============================================================================
# Security Groups
# =============================================================================

resource "scaleway_instance_security_group" "base" {
  name                    = "${var.project_name}-base-sg"
  zone                    = var.scw_zone
  inbound_default_policy  = "drop"
  outbound_default_policy = "accept"

  inbound_rule {
    action   = "accept"
    port     = 22
    protocol = "TCP"
  }

  inbound_rule {
    action   = "accept"
    port     = 80
    protocol = "TCP"
  }

  inbound_rule {
    action   = "accept"
    port     = 443
    protocol = "TCP"
  }

  tags = ["terraform", var.project_name]
}

resource "scaleway_instance_security_group" "gpu" {
  count = var.gpu_enabled ? 1 : 0

  name                    = "${var.project_name}-gpu-sg"
  zone                    = var.gpu_zone
  inbound_default_policy  = "drop"
  outbound_default_policy = "accept"

  inbound_rule {
    action   = "accept"
    port     = 22
    protocol = "TCP"
  }

  inbound_rule {
    action   = "accept"
    port     = 11434
    protocol = "TCP"
    ip_range = "172.16.16.0/22"
  }

  tags = ["terraform", var.project_name]
}
