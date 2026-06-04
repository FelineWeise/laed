resource "scaleway_vpc_private_network" "laed" {
  name   = "laed-private"
  region = var.region
}

resource "scaleway_instance_private_nic" "base_nic" {
  server_id          = var.laed_base_instance_id
  private_network_id = scaleway_vpc_private_network.laed.id
  zone               = var.base_zone
}

resource "scaleway_instance_security_group" "gpu" {
  name                    = "laed-gpu-sg"
  zone                    = var.zone
  inbound_default_policy  = "drop"
  outbound_default_policy = "accept"

  inbound_rule {
    action   = "accept"
    protocol = "TCP"
    port     = 22
    ip_range = var.base_server_private_ip_cidr
  }

  inbound_rule {
    action   = "accept"
    protocol = "TCP"
    port     = 11434
    ip_range = var.base_server_private_ip_cidr
  }

  inbound_rule {
    action   = "accept"
    protocol = "TCP"
    port     = 11435
    ip_range = var.base_server_private_ip_cidr
  }
}
