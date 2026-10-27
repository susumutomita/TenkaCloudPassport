Pod::Spec.new do |s|
  s.name = 'PassportPracticeGeneration'
  s.version = '1.0.0'
  s.summary = 'Bounded on-device practice generation for Passport'
  s.description = 'An Expo bridge to Apple Foundation Models. No remote model, tools or user content.'
  s.license = { :type => 'Apache-2.0' }
  s.author = 'TenkaCloud'
  s.homepage = 'https://github.com/susumutomita/TenkaCloudPassport'
  s.platforms = { :ios => '15.1' }
  s.source = { :git => 'https://github.com/susumutomita/TenkaCloudPassport.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.swift_version = '5.9'
  s.source_files = '**/*.swift'
  s.weak_frameworks = 'FoundationModels'
end
