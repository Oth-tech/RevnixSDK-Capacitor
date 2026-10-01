require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'RevnixCapacitor'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license']
  s.homepage = package['repository']['url']
  s.author = package['author']
  # :submodules — ios/Revnix is a git submodule; a :git fetch must pull it.
  s.source = { :git => package['repository']['url'], :tag => s.version.to_s, :submodules => true }
  # revnix-swift is the git submodule at ios/Revnix, compiled straight into
  # this pod until it ships to CocoaPods — then drop the second glob and add
  #   s.dependency 'Revnix', '~> 0.2'
  s.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}',
                   'ios/Revnix/Sources/Revnix/**/*.swift'
  s.resource_bundles = { 'RevnixCapacitor_Privacy' => ['ios/Revnix/Sources/Revnix/PrivacyInfo.xcprivacy'] }
  # revnix-swift's floor (StoreKit 2 + SwiftUI renderer).
  s.ios.deployment_target = '16.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
end
