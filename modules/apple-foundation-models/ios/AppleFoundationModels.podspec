Pod::Spec.new do |spec|
  spec.name = 'AppleFoundationModels'
  spec.version = '1.0.0'
  spec.summary = 'On-device Apple Intelligence (FoundationModels) bridge for the conversation agent.'
  spec.description = 'Availability check and single-turn guided generation via SystemLanguageModel, ' \
                      'gracefully unavailable on pre-iOS 26 or ineligible devices.'
  spec.author = 'Susumu Tomita'
  spec.homepage = 'https://github.com/susumutomita/TenkaCloudPassport'
  spec.platforms = {
    :ios => '16.4'
  }
  spec.source = { git: '' }
  spec.static_framework = true
  spec.dependency 'ExpoModulesCore'
  # FoundationModels.framework は iOS 26 未満に存在しない。deployment target（16.4）を
  # そのまま維持しつつ弱リンクし、旧 OS の端末で起動時クラッシュを起こさない
  # （`@available(iOS 26.0, *)` は呼び出し可否を検査するだけで、リンクは別問題）。
  spec.weak_frameworks = ['FoundationModels']
  spec.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
  spec.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
