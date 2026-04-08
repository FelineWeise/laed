# Only created when var.manage_dns = true.
# Requires the domain's NS records to point to Scaleway DNS.
# If DNS is managed elsewhere, set manage_dns = false and create
# an A record manually using: terraform output -raw base_public_ip

resource "scaleway_domain_record" "main" {
  count = var.manage_dns ? 1 : 0

  dns_zone = var.domain
  name     = ""
  type     = "A"
  data     = scaleway_instance_ip.base.address
  ttl      = 3600
}
