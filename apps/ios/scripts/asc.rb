require "openssl"; require "base64"; require "json"; require "net/http"
b=->(s){Base64.urlsafe_encode64(s,padding:false)}
key=OpenSSL::PKey::EC.new(File.read(ENV["ASC_KEY_PATH"]))
h=b.(JSON.dump(alg:"ES256",kid:ENV["ASC_KEY_ID"],typ:"JWT"))
p=b.(JSON.dump(iss:ENV["ASC_ISSUER_ID"],iat:Time.now.to_i,exp:Time.now.to_i+1000,aud:"appstoreconnect-v1"))
der=key.sign(OpenSSL::Digest::SHA256.new,"#{h}.#{p}")
sig=OpenSSL::ASN1.decode(der).value.map{|i|i.value.to_s(2).rjust(32,"\0")}.join
jwt="#{h}.#{p}.#{b.(sig)}"
m,path,body=ARGV
u=URI("https://api.appstoreconnect.apple.com"+path)
req=Net::HTTP.const_get(m.capitalize).new(u,{"Authorization"=>"Bearer #{jwt}","Content-Type"=>"application/json"})
req.body=body if body
r=Net::HTTP.start(u.host,443,use_ssl:true){|x|x.request(req)}
puts r.code; puts r.body.to_s[0,2500]
