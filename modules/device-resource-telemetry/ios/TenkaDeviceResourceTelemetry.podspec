Pod::Spec.new do |spec|
  spec.name = 'TenkaDeviceResourceTelemetry'
  spec.version = '1.0.0'
  spec.summary = 'Content-free device resource telemetry for local model guards.'
  spec.description = 'Reports bounded memory, thermal, and battery metrics without device identifiers.'
  spec.author = 'Susumu Tomita'
  spec.homepage = 'https://github.com/susumutomita/TenkaCloudPassport'
  spec.platforms = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  spec.source = { git: '' }
  spec.static_framework = true
  spec.dependency 'ExpoModulesCore'
  spec.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
  spec.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
